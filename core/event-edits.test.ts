import { describe, expect, test } from "bun:test";
import {
	createEvent,
	deleteOccurrence,
	editOccurrence,
	shiftWallClock,
	storedDuration,
	type EventWrites,
} from "./event-edits";
import { expandInstances } from "./recurrence";
import type { CalendarEvent, EditMode, EventException, EventFields } from "./types";

const TZ = "Europe/Bucharest";
const utc = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = utc("2026-10-26T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");

// One counter for the whole file, so that ids never repeat.
let lastId = 0;
function env() {
	return { now: NOW, newId: () => `id${++lastId}` };
}

/** Creates the event under test with the id "e1". */
const create = (f: EventFields) => new Store().apply(createEvent(f, TZ, { now: NOW, newId: () => "e1" }));

const stamp = { created_at: 0, updated_at: 0, device_id: "d" };

/** An in-memory store that applies writes the way writeRow() does: upsert by id. */
class Store {
	events: CalendarEvent[] = [];
	exceptions: EventException[] = [];
	apply(writes: EventWrites) {
		for (const row of writes.events) {
			this.events = [...this.events.filter((e) => e.id !== row.id), { ...stamp, ...row } as CalendarEvent];
		}
		for (const row of writes.exceptions) {
			this.exceptions = [...this.exceptions.filter((x) => x.id !== row.id), { ...stamp, ...row } as EventException];
		}
		return this;
	}
	event(id = "e1") {
		return this.events.find((e) => e.id === id)!;
	}
	live(eventId = "e1") {
		return this.exceptions.filter((x) => x.event_id === eventId && x.deleted_at === null);
	}
	starts(from: string, to: string) {
		return expandInstances(this.events, this.exceptions, utc(from), utc(to)).map((i) => iso(i.start));
	}
	instances(from: string, to: string) {
		return expandInstances(this.events, this.exceptions, utc(from), utc(to));
	}
	edit(originalStart: number, mode: EditMode, changes: Partial<EventFields>, id = "e1", e = env()) {
		return this.apply(
			editOccurrence({ event: this.event(id), exceptions: this.live(id), originalStart, mode, changes, env: e }),
		);
	}
	remove(originalStart: number, mode: EditMode, id = "e1") {
		return this.apply(deleteOccurrence({ event: this.event(id), exceptions: this.live(id), originalStart, mode, env: env() }));
	}
}

function fields(partial: Partial<EventFields>): EventFields {
	return { title: "Standup", notes: "", color: null, start: 0, end: 0, allDay: false, rrule: null, ...partial };
}

// Monday 2026-10-05 09:00–10:00 local (summer time, +03:00).
const MON = utc("2026-10-05T06:00:00Z");
const weeklyMonday = (rrule = "FREQ=WEEKLY;BYDAY=MO;INTERVAL=1") => create(fields({ start: MON, end: MON + HOUR, rrule }));

describe("createEvent", () => {
	test("a one-off event", () => {
		const s = create(fields({ title: "  Call ", start: MON, end: MON + HOUR }));
		expect(s.event()).toMatchObject({ title: "Call", starts_at: MON, duration_ms: HOUR, tzid: TZ, rrule: null, all_day: 0 });
	});

	test("starts_at moves to the first occurrence the rule allows", () => {
		const s = create(fields({ start: MON, end: MON + HOUR, rrule: "FREQ=WEEKLY;BYDAY=WE" }));
		expect(iso(s.event().starts_at)).toBe("2026-10-07T06:00:00Z");
	});

	test("an all-day event starts at local midnight and stores whole days", () => {
		const s = create(fields({ start: MON, end: MON + 2 * DAY, allDay: true }));
		expect(s.event()).toMatchObject({ starts_at: utc("2026-10-04T21:00:00Z"), duration_ms: 2 * DAY, all_day: 1 });
	});

	test("errors", () => {
		expect(() => createEvent(fields({ start: MON, end: MON }), TZ, env())).toThrow("end-before-start");
		expect(() => createEvent(fields({ start: MON, end: MON + HOUR, rrule: "BYDAY=MO" }), TZ, env())).toThrow(
			"invalid-rule",
		);
		expect(() =>
			createEvent(fields({ start: MON, end: MON + HOUR, rrule: "FREQ=DAILY;UNTIL=20200101T000000Z" }), TZ, env()),
		).toThrow("no-occurrences");
	});
});

describe("storedDuration and shiftWallClock", () => {
	test("all-day durations are whole days, also over a DST change", () => {
		expect(storedDuration(utc("2026-10-24T21:00:00Z"), utc("2026-10-25T22:00:00Z"), true)).toBe(DAY);
		expect(storedDuration(MON, MON + 90 * 60_000, false)).toBe(90 * 60_000);
	});

	test("a move keeps local time across DST", () => {
		// The series starts 10-05 09:00 (+03:00). The 10-26 occurrence (+02:00) moves from 09:00 to 10:00.
		const moved = shiftWallClock(MON, utc("2026-10-26T07:00:00Z"), utc("2026-10-26T08:00:00Z"), TZ);
		expect(iso(moved)).toBe("2026-10-05T07:00:00Z");
	});
});

describe("edit: this occurrence", () => {
	const oct12 = utc("2026-10-12T06:00:00Z");
	const tue14 = utc("2026-10-13T11:00:00Z");

	test("moves one occurrence and keeps the others", () => {
		const s = weeklyMonday().edit(oct12, "this", { start: tue14, end: tue14 + HOUR });
		expect(s.starts("2026-10-04T21:00:00Z", "2026-10-25T21:00:00Z")).toEqual([
			"2026-10-05T06:00:00Z",
			"2026-10-13T11:00:00Z",
			"2026-10-19T06:00:00Z",
		]);
		expect(s.live()).toEqual([
			expect.objectContaining({
				original_start: oct12,
				kind: "modified",
				new_starts_at: tue14,
				new_duration_ms: null,
				new_title: null,
			}),
		]);
	});

	test("a second edit updates the same exception; moving it back removes it", () => {
		const s = weeklyMonday().edit(oct12, "this", { start: tue14, end: tue14 + HOUR });
		const id = s.live()[0].id;
		s.edit(oct12, "this", { title: "Moved" });
		expect(s.live()).toEqual([expect.objectContaining({ id, new_starts_at: tue14, new_title: "Moved" })]);
		s.edit(oct12, "this", { start: oct12, end: oct12 + HOUR, title: "Standup" });
		expect(s.live()).toEqual([]);
		expect(s.instances("2026-10-11T21:00:00Z", "2026-10-12T21:00:00Z")[0].isException).toBe(false);
	});

	test("the rule, all-day and color cannot change for one occurrence", () => {
		const s = weeklyMonday();
		expect(() => s.edit(oct12, "this", { rrule: "FREQ=DAILY" })).toThrow("mode-not-allowed");
		expect(() => s.edit(oct12, "this", { allDay: true })).toThrow("mode-not-allowed");
		expect(() => s.edit(oct12, "this", { color: "#ff0000" })).toThrow("mode-not-allowed");
	});

	test("a start the rule does not generate is refused", () => {
		expect(() => weeklyMonday().edit(oct12 + DAY, "this", { title: "x" })).toThrow("not-an-occurrence");
	});
});

describe("edit: all occurrences", () => {
	const oct26 = utc("2026-10-26T07:00:00Z"); // Monday 09:00 local, winter time

	test("a one-hour drag on a later occurrence moves the series by one hour of local time", () => {
		const s = weeklyMonday().edit(oct26, "all", { start: oct26 + HOUR, end: oct26 + 2 * HOUR });
		expect(iso(s.event().starts_at)).toBe("2026-10-05T07:00:00Z");
		expect(s.starts("2026-10-18T21:00:00Z", "2026-11-01T22:00:00Z")).toEqual([
			"2026-10-19T07:00:00Z",
			"2026-10-26T08:00:00Z",
		]);
	});

	test("a drag to Tuesday moves the weekday of the rule", () => {
		const s = weeklyMonday().edit(oct26, "all", { start: oct26 + DAY, end: oct26 + DAY + HOUR });
		expect(s.event().rrule).toBe("FREQ=WEEKLY;BYDAY=TU;INTERVAL=1");
		expect(iso(s.event().starts_at)).toBe("2026-10-06T06:00:00Z");
	});

	test("a title change keeps exceptions; a time or rule change drops them", () => {
		const oct12 = utc("2026-10-12T06:00:00Z");
		const s = weeklyMonday().edit(oct12, "this", { title: "One" });
		s.edit(oct26, "all", { title: "Renamed" });
		expect(s.live()).toHaveLength(1);
		expect(s.instances("2026-10-11T21:00:00Z", "2026-10-12T21:00:00Z")[0].title).toBe("One");
		s.edit(oct26, "all", { rrule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=2" });
		expect(s.live()).toHaveLength(0);
	});

	test("a one-off event ignores the mode", () => {
		const s = create(fields({ start: MON, end: MON + HOUR }));
		s.edit(MON, "this", { start: MON + HOUR, end: MON + 3 * HOUR });
		expect(s.event()).toMatchObject({ starts_at: MON + HOUR, duration_ms: 2 * HOUR });
	});
});

describe("edit: this and following", () => {
	test("split with COUNT: old series has 3, new series has 7", () => {
		const s = weeklyMonday("FREQ=WEEKLY;BYDAY=MO;COUNT=10;INTERVAL=1");
		const fourth = utc("2026-10-26T07:00:00Z");
		s.edit(fourth, "following", { start: fourth + HOUR, end: fourth + 2 * HOUR, title: "Later" });
		const all = s.instances("2026-01-01T00:00:00Z", "2027-12-31T00:00:00Z");
		expect(all.filter((i) => i.eventId === "e1")).toHaveLength(3);
		const next = all.filter((i) => i.eventId !== "e1");
		expect(next).toHaveLength(7);
		expect(next[0]).toMatchObject({ start: fourth + HOUR, title: "Later" });
		expect(s.event().rrule).toBe("FREQ=WEEKLY;BYDAY=MO;INTERVAL=1;UNTIL=20261026T065959Z");
	});

	test("without COUNT the new series has no end, and exceptions at or after the split are dropped", () => {
		const oct12 = utc("2026-10-12T06:00:00Z");
		const nov2 = utc("2026-11-02T07:00:00Z");
		const s = weeklyMonday().edit(oct12, "this", { title: "Before" }).edit(nov2, "this", { title: "After" });
		const oct26 = utc("2026-10-26T07:00:00Z");
		s.edit(oct26, "following", { start: oct26 + DAY, end: oct26 + DAY + HOUR }, "e1", {
			now: NOW,
			newId: () => "series2",
		});
		expect(s.live().map((x) => x.original_start)).toEqual([oct12]);
		expect(s.event("series2")).toMatchObject({ starts_at: oct26 + DAY, rrule: "FREQ=WEEKLY;BYDAY=TU;INTERVAL=1" });
		expect(s.starts("2026-10-04T21:00:00Z", "2026-11-08T22:00:00Z")).toEqual([
			"2026-10-05T06:00:00Z",
			"2026-10-12T06:00:00Z",
			"2026-10-19T06:00:00Z",
			"2026-10-27T07:00:00Z",
			"2026-11-03T07:00:00Z",
		]);
	});

	test("from the first occurrence it changes the whole series and drops all exceptions", () => {
		const s = weeklyMonday().edit(utc("2026-10-12T06:00:00Z"), "this", { title: "x" });
		s.edit(MON, "following", { title: "Renamed" });
		expect(s.events).toHaveLength(1);
		expect(s.event().title).toBe("Renamed");
		expect(s.live()).toHaveLength(0);
	});

	test("a new count from the dialog is used as given", () => {
		const s = weeklyMonday("FREQ=WEEKLY;BYDAY=MO;COUNT=10;INTERVAL=1");
		const fourth = utc("2026-10-26T07:00:00Z");
		s.edit(fourth, "following", { rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2;INTERVAL=1" }, "e1", {
			now: NOW,
			newId: () => "series2",
		});
		expect(s.event("series2").rrule).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=2;INTERVAL=1");
	});
});

describe("delete", () => {
	const oct12 = utc("2026-10-12T06:00:00Z");
	const oct19 = utc("2026-10-19T06:00:00Z");
	const range = ["2026-10-04T21:00:00Z", "2026-10-25T21:00:00Z"] as const;

	test("this occurrence adds a cancelled exception, or turns a modified one into it", () => {
		const s = weeklyMonday().edit(oct12, "this", { title: "x" });
		const id = s.live()[0].id;
		s.remove(oct12, "this");
		expect(s.live()).toEqual([expect.objectContaining({ id, kind: "cancelled", new_title: null })]);
		s.remove(oct19, "this");
		expect(s.starts(...range)).toEqual(["2026-10-05T06:00:00Z"]);
	});

	test("this and following ends the series before the occurrence", () => {
		const s = weeklyMonday().edit(oct19, "this", { title: "x" }).remove(oct12, "following");
		expect(s.starts(...range)).toEqual(["2026-10-05T06:00:00Z"]);
		expect(s.live()).toHaveLength(0);
		expect(s.event().deleted_at).toBeNull();
	});

	test("this and following from the first occurrence, and all, delete the event and its exceptions", () => {
		for (const [start, mode] of [
			[MON, "following"],
			[oct19, "all"],
		] as const) {
			const s = weeklyMonday().edit(oct12, "this", { title: "x" }).remove(start, mode);
			expect(s.event().deleted_at).toBe(NOW);
			expect(s.live()).toHaveLength(0);
			expect(s.starts(...range)).toEqual([]);
		}
	});

	test("a one-off event is deleted whatever the mode", () => {
		const s = create(fields({ start: MON, end: MON + HOUR })).remove(MON, "this");
		expect(s.event().deleted_at).toBe(NOW);
	});
});
