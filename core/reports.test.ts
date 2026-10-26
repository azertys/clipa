import { describe, expect, test } from "bun:test";
import { coverageList, eventCoverage, trackedIntervals } from "./reports";
import type { Instance } from "./types";

// Local Europe/Bucharest on 2026-10-26 (+02:00): 08:00 local = 06:00Z.
const at = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00+02:00`);
const DAY = [at("00:00"), at("00:00") + 86_400_000] as const;
const HOUR = 3_600_000;
const entry = (from: string, to: string | null) => ({ started_at: at(from), ended_at: to === null ? null : at(to) });
const event = { start: at("08:00"), end: at("12:00") };

const cover = (entries: ReturnType<typeof entry>[], range = DAY, now = at("23:00")) =>
	eventCoverage(event, trackedIntervals(entries, range[0], range[1], now), range[0], range[1]);

describe("eventCoverage (spec section 12)", () => {
	test("partial cover", () => {
		expect(cover([entry("09:00", "11:00")])).toEqual({
			plannedMs: 4 * HOUR,
			trackedMs: 2 * HOUR,
			coverage: 0.5,
			segments: [{ start: at("09:00"), end: at("11:00") }],
			partial: false,
		});
	});

	test("full cover", () => {
		expect(cover([entry("07:00", "13:00")])).toMatchObject({ trackedMs: 4 * HOUR, coverage: 1 });
	});

	test("two segments", () => {
		const c = cover([entry("07:00", "09:00"), entry("11:00", "13:00")]);
		expect(c).toMatchObject({ trackedMs: 2 * HOUR, coverage: 0.5 });
		expect(c.segments).toHaveLength(2);
	});

	test("overlapping entries count once", () => {
		expect(cover([entry("09:00", "11:00"), entry("10:00", "12:00")])).toMatchObject({
			trackedMs: 3 * HOUR,
			coverage: 0.75,
		});
	});

	test("a running entry counts up to now", () => {
		expect(cover([entry("09:00", null)], DAY, at("10:30"))).toMatchObject({ trackedMs: 1.5 * HOUR });
	});

	test("clipped event: the range starts at 10:00", () => {
		const range = [at("10:00"), DAY[1]] as const;
		expect(cover([entry("09:00", "11:00")], range)).toMatchObject({
			plannedMs: 2 * HOUR,
			trackedMs: HOUR,
			coverage: 0.5,
			partial: true,
		});
	});
});

test("coverageList leaves out all-day instances", () => {
	const instance = (allDay: boolean): Instance => ({
		eventId: allDay ? "a" : "t",
		originalStart: at("08:00"),
		start: at("08:00"),
		end: at("12:00"),
		title: "",
		notes: "",
		color: null,
		allDay,
		recurring: false,
		isException: false,
	});
	const list = coverageList([instance(true), instance(false)], [], ...DAY);
	expect(list.map((c) => c.instance.eventId)).toEqual(["t"]);
	expect(list[0].coverage).toBe(0);
});
