import { describe, expect, test } from "bun:test";
import { allDayDays, expandInstances, firstOccurrence, isOccurrence, occurrenceEnd, occurrenceStarts, touches } from "./recurrence";
import type { CalendarEvent, EventException } from "./types";

// Times are Europe/Bucharest. 2026: summer time starts 03-29 03:00 → 04:00 and ends 10-25 04:00 → 03:00.
const TZ = "Europe/Bucharest";
const utc = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");

function event(partial: Partial<CalendarEvent>): CalendarEvent {
	return {
		id: "e1",
		title: "Event",
		notes: "",
		color: null,
		starts_at: utc("2026-10-26T06:00:00Z"),
		duration_ms: 4 * HOUR,
		all_day: 0,
		tzid: TZ,
		rrule: null,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
		device_id: "d",
		...partial,
	};
}

function exception(partial: Partial<EventException>): EventException {
	return {
		id: "x1",
		event_id: "e1",
		original_start: 0,
		kind: "cancelled",
		new_starts_at: null,
		new_duration_ms: null,
		new_title: null,
		new_notes: null,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
		device_id: "d",
		...partial,
	};
}

const starts = (events: CalendarEvent[], exceptions: EventException[], from: string, to: string) =>
	expandInstances(events, exceptions, utc(from), utc(to)).map((i) => iso(i.start));

describe("touches", () => {
	test("half-open intervals", () => {
		expect(touches(0, 10, 5, 15)).toBe(true);
		expect(touches(0, 10, 10, 20)).toBe(false);
		expect(touches(10, 20, 0, 10)).toBe(false);
		expect(touches(0, 10, 2, 3)).toBe(true);
	});
});

describe("expandInstances, one-off events", () => {
	test("returns an event that touches the range", () => {
		const out = expandInstances([event({})], [], utc("2026-10-26T00:00:00Z"), utc("2026-10-27T00:00:00Z"));
		expect(out).toEqual([
			{
				eventId: "e1",
				originalStart: utc("2026-10-26T06:00:00Z"),
				start: utc("2026-10-26T06:00:00Z"),
				end: utc("2026-10-26T10:00:00Z"),
				title: "Event",
				notes: "",
				color: null,
				allDay: false,
				recurring: false,
				isException: false,
			},
		]);
	});

	test("skips events outside the range and deleted events", () => {
		const from = utc("2026-10-26T10:00:00Z");
		expect(expandInstances([event({})], [], from, from + HOUR)).toEqual([]);
		expect(expandInstances([event({ deleted_at: 1 })], [], 0, Number.MAX_SAFE_INTEGER)).toEqual([]);
	});

	test("sorts by start", () => {
		const a = event({ id: "a", starts_at: utc("2026-10-26T09:00:00Z") });
		const b = event({ id: "b", starts_at: utc("2026-10-26T07:00:00Z") });
		const out = expandInstances([a, b], [], 0, utc("2027-01-01T00:00:00Z"));
		expect(out.map((i) => i.eventId)).toEqual(["b", "a"]);
	});

	test("range edge: an event 23:00–01:00 is included when the range starts at 00:00", () => {
		// 23:00 local on 10-26 (EET) is 21:00Z.
		const e = event({ starts_at: utc("2026-10-26T21:00:00Z"), duration_ms: 2 * HOUR });
		const out = expandInstances([e], [], utc("2026-10-26T22:00:00Z"), utc("2026-10-27T22:00:00Z"));
		expect(out).toHaveLength(1);
		expect(out[0].start).toBe(utc("2026-10-26T21:00:00Z"));
	});
});

describe("expandInstances, DST (spec section 12)", () => {
	test("DST end: daily 08:00–12:00 keeps 08:00 local and lasts 4 h", () => {
		const e = event({ starts_at: utc("2026-10-20T05:00:00Z"), duration_ms: 4 * HOUR, rrule: "FREQ=DAILY" });
		const out = expandInstances([e], [], utc("2026-10-23T21:00:00Z"), utc("2026-10-26T22:00:00Z"));
		expect(out.map((i) => iso(i.start))).toEqual(["2026-10-24T05:00:00Z", "2026-10-25T06:00:00Z", "2026-10-26T06:00:00Z"]);
		for (const i of out) expect(i.end - i.start).toBe(4 * HOUR);
	});

	test("spring-forward gap: 03:30 moves forward by the gap to 04:30 local", () => {
		const e = event({ starts_at: utc("2026-03-27T01:30:00Z"), duration_ms: HOUR, rrule: "FREQ=DAILY" });
		expect(starts([e], [], "2026-03-28T22:00:00Z", "2026-03-29T21:00:00Z")).toEqual(["2026-03-29T01:30:00Z"]);
		// The next day is back at 03:30 local, now in summer time.
		expect(starts([e], [], "2026-03-29T21:00:00Z", "2026-03-30T21:00:00Z")).toEqual(["2026-03-30T00:30:00Z"]);
	});

	test("fall-back overlap: 03:30 uses the first (earlier) instant", () => {
		const e = event({ starts_at: utc("2026-10-23T00:30:00Z"), duration_ms: HOUR, rrule: "FREQ=DAILY" });
		expect(starts([e], [], "2026-10-24T21:00:00Z", "2026-10-25T22:00:00Z")).toEqual(["2026-10-25T00:30:00Z"]);
	});

	test("an all-day event ends at the next local midnight, 25 h on the DST end day", () => {
		const e = event({ starts_at: utc("2026-10-23T21:00:00Z"), duration_ms: DAY, all_day: 1, rrule: "FREQ=DAILY" });
		const out = expandInstances([e], [], utc("2026-10-24T21:00:00Z"), utc("2026-10-25T22:00:00Z"));
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ start: utc("2026-10-24T21:00:00Z"), end: utc("2026-10-25T22:00:00Z"), allDay: true });
	});
});

describe("expandInstances, exceptions (spec section 12)", () => {
	// Weekly on Monday 09:00 local from 2026-10-05.
	const weekly = event({ starts_at: utc("2026-10-05T06:00:00Z"), duration_ms: HOUR, rrule: "FREQ=WEEKLY;BYDAY=MO" });
	const oct12 = utc("2026-10-12T06:00:00Z");

	test("a cancelled occurrence is missing", () => {
		const x = exception({ original_start: oct12, kind: "cancelled" });
		expect(starts([weekly], [x], "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")).toEqual([
			"2026-10-05T06:00:00Z",
			"2026-10-19T06:00:00Z",
			"2026-10-26T07:00:00Z",
		]);
	});

	test("a modified occurrence moves to Tuesday 14:00 and is marked", () => {
		const x = exception({ original_start: oct12, kind: "modified", new_starts_at: utc("2026-10-13T11:00:00Z") });
		const out = expandInstances([weekly], [x], utc("2026-10-11T21:00:00Z"), utc("2026-10-18T21:00:00Z"));
		expect(out).toEqual([
			expect.objectContaining({
				originalStart: oct12,
				start: utc("2026-10-13T11:00:00Z"),
				end: utc("2026-10-13T12:00:00Z"),
				isException: true,
				recurring: true,
			}),
		]);
	});

	test("an occurrence moved into the range from outside it is included", () => {
		const x = exception({ original_start: oct12, kind: "modified", new_starts_at: utc("2026-10-13T11:00:00Z") });
		// Tuesday 10-13 only. The Monday it came from is outside the range.
		expect(starts([weekly], [x], "2026-10-12T21:00:00Z", "2026-10-13T21:00:00Z")).toEqual(["2026-10-13T11:00:00Z"]);
	});

	test("an occurrence moved out of the range is not included", () => {
		const x = exception({ original_start: oct12, kind: "modified", new_starts_at: utc("2026-10-13T11:00:00Z") });
		expect(starts([weekly], [x], "2026-10-11T21:00:00Z", "2026-10-12T21:00:00Z")).toEqual([]);
	});

	test("modified fields replace the series fields; null keeps the series value", () => {
		const x = exception({ original_start: oct12, kind: "modified", new_title: "Moved", new_duration_ms: 2 * HOUR });
		const [i] = expandInstances([weekly], [x], oct12, oct12 + HOUR);
		expect(i).toMatchObject({ start: oct12, end: oct12 + 2 * HOUR, title: "Moved", notes: "" });
	});

	test("deleted exceptions and exceptions for other events are ignored", () => {
		const deleted = exception({ original_start: oct12, deleted_at: 1 });
		const other = exception({ id: "x2", event_id: "other", original_start: oct12 });
		expect(starts([weekly], [deleted, other], "2026-10-11T21:00:00Z", "2026-10-12T21:00:00Z")).toEqual([
			"2026-10-12T06:00:00Z",
		]);
	});

	test("an exception for a start the rule does not generate is ignored", () => {
		const stale = exception({
			original_start: utc("2026-10-13T06:00:00Z"),
			kind: "modified",
			new_starts_at: utc("2026-10-14T06:00:00Z"),
		});
		expect(starts([weekly], [stale], "2026-10-13T21:00:00Z", "2026-10-14T21:00:00Z")).toEqual([]);
	});
});

describe("expandInstances, rules", () => {
	const at9 = utc("2026-10-05T06:00:00Z"); // Monday 09:00 local

	test("UNTIL is inclusive and compared as an instant", () => {
		const e = event({ starts_at: at9, duration_ms: HOUR, rrule: "FREQ=DAILY;UNTIL=20261007T060000Z" });
		expect(starts([e], [], "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")).toHaveLength(3);
	});

	test("COUNT limits the series", () => {
		const e = event({ starts_at: at9, duration_ms: HOUR, rrule: "FREQ=DAILY;COUNT=4" });
		expect(starts([e], [], "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")).toHaveLength(4);
	});

	test("every 2 weeks on Monday and Wednesday", () => {
		const e = event({ starts_at: at9, duration_ms: HOUR, rrule: "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2" });
		expect(starts([e], [], "2026-10-04T21:00:00Z", "2026-10-25T21:00:00Z")).toEqual([
			"2026-10-05T06:00:00Z",
			"2026-10-07T06:00:00Z",
			"2026-10-19T06:00:00Z",
			"2026-10-21T06:00:00Z",
		]);
	});

	test("every weekday skips Saturday and Sunday", () => {
		const e = event({ starts_at: at9, duration_ms: HOUR, rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" });
		expect(starts([e], [], "2026-10-04T21:00:00Z", "2026-10-11T21:00:00Z")).toHaveLength(5);
	});

	test("monthly on day 31 skips months without a day 31 (open question 8)", () => {
		const e = event({ starts_at: utc("2026-01-31T07:00:00Z"), duration_ms: HOUR, rrule: "FREQ=MONTHLY" });
		const days = expandInstances([e], [], utc("2026-01-01T00:00:00Z"), utc("2026-09-01T00:00:00Z")).map((i) =>
			new Date(i.start).toISOString().slice(0, 10),
		);
		expect(days).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31"]);
	});

	test("an occurrence that starts before the range and ends inside it is included", () => {
		const e = event({ starts_at: at9, duration_ms: 4 * HOUR, rrule: "FREQ=DAILY" });
		const out = expandInstances([e], [], utc("2026-10-06T08:00:00Z"), utc("2026-10-06T09:00:00Z"));
		expect(out.map((i) => iso(i.start))).toEqual(["2026-10-06T06:00:00Z"]);
	});

	test("a very large range is bounded", () => {
		const e = event({ starts_at: at9, duration_ms: HOUR, rrule: "FREQ=DAILY" });
		const out = expandInstances([e], [], 0, utc("2030-01-01T00:00:00Z"));
		expect(out.length).toBeGreaterThan(1000);
		expect(expandInstances([e], [], -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER + 1)).toEqual([]);
	});
});

describe("helpers", () => {
	test("occurrenceStarts and isOccurrence", () => {
		const e = event({ starts_at: utc("2026-10-05T06:00:00Z"), rrule: "FREQ=WEEKLY;BYDAY=MO" });
		expect(occurrenceStarts(e, utc("2026-10-05T06:00:00Z"), utc("2026-10-19T06:00:00Z")).map(iso)).toEqual([
			"2026-10-05T06:00:00Z",
			"2026-10-12T06:00:00Z",
		]);
		expect(isOccurrence(e, utc("2026-10-12T06:00:00Z"))).toBe(true);
		expect(isOccurrence(e, utc("2026-10-13T06:00:00Z"))).toBe(false);
	});

	test("firstOccurrence moves to the first day the rule allows", () => {
		// Monday start, Wednesday-only rule.
		const e = event({ starts_at: utc("2026-10-05T06:00:00Z"), rrule: "FREQ=WEEKLY;BYDAY=WE" });
		expect(iso(firstOccurrence(e)!)).toBe("2026-10-07T06:00:00Z");
		expect(firstOccurrence(event({ rrule: "FREQ=DAILY;UNTIL=20200101T000000Z" }))).toBeNull();
	});

	test("allDayDays and occurrenceEnd", () => {
		expect(allDayDays(DAY)).toBe(1);
		expect(allDayDays(23 * HOUR)).toBe(1);
		expect(allDayDays(3 * DAY)).toBe(3);
		expect(occurrenceEnd(utc("2026-10-24T21:00:00Z"), DAY, true, TZ)).toBe(utc("2026-10-25T22:00:00Z"));
		expect(occurrenceEnd(utc("2026-10-24T21:00:00Z"), DAY, false, TZ)).toBe(utc("2026-10-25T21:00:00Z"));
	});
});
