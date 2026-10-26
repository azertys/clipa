import { describe, expect, test } from "bun:test";
import { expandInstances, touches } from "./recurrence";
import type { CalendarEvent } from "./types";

const utc = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;

function event(partial: Partial<CalendarEvent>): CalendarEvent {
	return {
		id: "e1",
		title: "Event",
		notes: "",
		color: null,
		starts_at: utc("2026-10-26T06:00:00Z"),
		duration_ms: 4 * HOUR,
		all_day: 0,
		tzid: "Europe/Bucharest",
		rrule: null,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
		device_id: "d",
		...partial,
	};
}

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
				allDay: false,
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
		const out = expandInstances([a, b], [], 0, Number.MAX_SAFE_INTEGER);
		expect(out.map((i) => i.eventId)).toEqual(["b", "a"]);
	});
});
