import { describe, expect, test } from "bun:test";
import type { EventFields } from "../../../core/types";
import { testDb } from "../test-helpers";
import {
	deleteEventOccurrence,
	editEventOccurrence,
	eventsForRange,
	getEvent,
	listInstances,
	liveExceptions,
	saveNewEvent,
} from "./events";

const TZ = "Europe/Bucharest";
const utc = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MON = utc("2026-10-05T06:00:00Z"); // Monday 09:00 local
const OCT = [utc("2026-10-01T00:00:00Z"), utc("2026-11-01T00:00:00Z")] as const;

const fields = (partial: Partial<EventFields>): EventFields => ({
	title: "Standup",
	notes: "",
	color: null,
	start: MON,
	end: MON + HOUR,
	allDay: false,
	rrule: null,
	...partial,
});

describe("events repository", () => {
	test("create a series and list its instances", () => {
		const { db, ctx } = testDb();
		const e = saveNewEvent(db, ctx, fields({ rrule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=1" }), TZ);
		expect(e).toMatchObject({ tzid: TZ, device_id: "device-a", created_at: ctx.now(), deleted_at: null });
		expect(listInstances(db, ...OCT).map((i) => i.start)).toHaveLength(4);
	});

	test("edit one occurrence, then the following ones, in transactions", () => {
		const { db, ctx, advance } = testDb();
		const e = saveNewEvent(db, ctx, fields({ rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=10;INTERVAL=1" }), TZ);
		const oct12 = MON + 7 * DAY;
		advance(1000);
		editEventOccurrence(db, ctx, { eventId: e.id, originalStart: oct12, mode: "this", changes: { title: "Moved" } });
		expect(liveExceptions(db, e.id)).toEqual([
			expect.objectContaining({ kind: "modified", new_title: "Moved", updated_at: ctx.now() }),
		]);

		const fourth = utc("2026-10-26T07:00:00Z");
		editEventOccurrence(db, ctx, {
			eventId: e.id,
			originalStart: fourth,
			mode: "following",
			changes: { start: fourth + HOUR, end: fourth + 2 * HOUR },
		});
		const all = listInstances(db, utc("2026-01-01T00:00:00Z"), utc("2027-12-31T00:00:00Z"));
		expect(all.filter((i) => i.eventId === e.id)).toHaveLength(3);
		expect(all.filter((i) => i.eventId !== e.id)).toHaveLength(7);
		expect(all.find((i) => i.originalStart === oct12)?.title).toBe("Moved");
		expect((db.query("SELECT count(*) AS n FROM events").get() as { n: number }).n).toBe(2);
	});

	test("errors arrive as codes and change nothing", () => {
		const { db, ctx } = testDb();
		expect(() => saveNewEvent(db, ctx, fields({ end: MON }), TZ)).toThrow("EVENT_END_BEFORE_START");
		expect(() => saveNewEvent(db, ctx, fields({ rrule: "FREQ=SOMETIMES" }), TZ)).toThrow("EVENT_RULE_INVALID");
		const e = saveNewEvent(db, ctx, fields({ rrule: "FREQ=DAILY" }), TZ);
		expect(() =>
			editEventOccurrence(db, ctx, { eventId: e.id, originalStart: MON + HOUR, mode: "this", changes: { title: "x" } }),
		).toThrow("EVENT_NOT_AN_OCCURRENCE");
		expect(() =>
			editEventOccurrence(db, ctx, { eventId: "missing", originalStart: MON, mode: "all", changes: {} }),
		).toThrow("EVENT_NOT_FOUND");
		expect(liveExceptions(db, e.id)).toEqual([]);
		expect((db.query("SELECT count(*) AS n FROM events").get() as { n: number }).n).toBe(1);
	});

	test("delete one occurrence, then the whole series", () => {
		const { db, ctx } = testDb();
		const e = saveNewEvent(db, ctx, fields({ rrule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=1" }), TZ);
		deleteEventOccurrence(db, ctx, { eventId: e.id, originalStart: MON + 7 * DAY, mode: "this" });
		expect(listInstances(db, ...OCT)).toHaveLength(3);
		deleteEventOccurrence(db, ctx, { eventId: e.id, originalStart: MON, mode: "all" });
		expect(listInstances(db, ...OCT)).toEqual([]);
		expect(getEvent(db, e.id)!.deleted_at).toBe(ctx.now());
		expect(liveExceptions(db, e.id)).toEqual([]);
	});

	test("the range query finds a series that an exception moved into the range", () => {
		const { db, ctx } = testDb();
		// A weekly series that starts on 2026-11-02. Its first occurrence moves back to 10-30.
		const nov2 = utc("2026-11-02T07:00:00Z");
		const e = saveNewEvent(db, ctx, fields({ start: nov2, end: nov2 + HOUR, rrule: "FREQ=WEEKLY;INTERVAL=1" }), TZ);
		const oct30 = utc("2026-10-30T07:00:00Z");
		editEventOccurrence(db, ctx, {
			eventId: e.id,
			originalStart: nov2,
			mode: "this",
			changes: { start: oct30, end: oct30 + HOUR },
		});
		expect(eventsForRange(db, ...OCT).events.map((x) => x.id)).toEqual([e.id]);
		expect(listInstances(db, ...OCT).map((i) => i.start)).toEqual([oct30]);
	});
});
