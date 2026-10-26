import { describe, expect, test } from "bun:test";
import { buildReport, coverageList, eventCoverage, trackedIntervals, type ReportInput } from "./reports";
import type { CalendarEvent, Instance } from "./types";

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

describe("buildReport (spec section 12)", () => {
	const TZ = "Europe/Bucharest";
	let n = 0;
	const ev = (from: string, to: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
		id: `e${++n}`,
		title: `Event ${n}`,
		notes: "",
		color: null,
		starts_at: at(from),
		duration_ms: at(to) - at(from),
		all_day: 0,
		tzid: TZ,
		rrule: null,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
		device_id: "d",
		...extra,
	});
	const tagged = (from: string, to: string | null, tagIds: string[] = []) => ({ ...entry(from, to), tagIds });
	const report = (input: Partial<ReportInput>) =>
		buildReport({
			from: DAY[0],
			to: DAY[1],
			tzid: TZ,
			now: at("23:00"),
			entries: [],
			events: [],
			exceptions: [],
			activity: [],
			apps: [],
			includeAllDay: false,
			...input,
		});

	test("partial cover: 2:00 tracked, 50.0 %, one segment", () => {
		const r = report({ events: [ev("08:00", "12:00")], entries: [tagged("09:00", "11:00")] });
		expect(r.events[0]).toMatchObject({ trackedMs: 2 * HOUR, plannedMs: 4 * HOUR, coverage: 0.5, partial: false });
		expect(r.events[0].segments).toEqual([{ start: at("09:00"), end: at("11:00") }]);
	});

	test("full cover: 4:00, 100 %, outside events 2:00", () => {
		const r = report({ events: [ev("08:00", "12:00")], entries: [tagged("07:00", "13:00")] });
		expect(r.events[0]).toMatchObject({ trackedMs: 4 * HOUR, coverage: 1 });
		expect(r.totals).toEqual({ trackedMs: 6 * HOUR, plannedMs: 4 * HOUR, coveredMs: 4 * HOUR, outsideEventsMs: 2 * HOUR });
	});

	test("overlapping entries count once in totals", () => {
		const r = report({ events: [ev("08:00", "12:00")], entries: [tagged("09:00", "11:00"), tagged("10:00", "12:00")] });
		expect(r.events[0]).toMatchObject({ trackedMs: 3 * HOUR, coverage: 0.75 });
		expect(r.totals.trackedMs).toBe(3 * HOUR);
		expect(r.entryCount).toBe(2);
	});

	test("overlapping events: 3:00 each, total 4:00, outside 0:00", () => {
		const r = report({ events: [ev("08:00", "12:00"), ev("10:00", "14:00")], entries: [tagged("09:00", "13:00")] });
		expect(r.events.map((e) => e.trackedMs)).toEqual([3 * HOUR, 3 * HOUR]);
		expect(r.totals).toMatchObject({ trackedMs: 4 * HOUR, plannedMs: 6 * HOUR, coveredMs: 4 * HOUR, outsideEventsMs: 0 });
	});

	test("across midnight: 2:00 on each day", () => {
		const r = report({
			from: DAY[0],
			to: DAY[1] + 86_400_000,
			entries: [{ started_at: at("22:00"), ended_at: at("22:00") + 4 * HOUR, tagIds: [] }],
		});
		expect(r.days.map((d) => [d.date, d.trackedMs])).toEqual([
			["2026-10-26", 2 * HOUR],
			["2026-10-27", 2 * HOUR],
		]);
	});

	test("running entry: tracked up to now", () => {
		expect(report({ entries: [tagged("09:00", null)], now: at("10:30") }).totals.trackedMs).toBe(1.5 * HOUR);
	});

	test("clipped event: tracked 1:00 of 2:00, partial", () => {
		const r = report({ from: at("10:00"), events: [ev("08:00", "12:00")], entries: [tagged("09:00", "11:00")] });
		expect(report({ from: at("11:00"), entries: [tagged("09:00", "11:00")] }).entryCount).toBe(0);
		expect(r.events[0]).toMatchObject({ trackedMs: HOUR, plannedMs: 2 * HOUR, coverage: 0.5, partial: true });
	});

	test("planned time is clipped to the range, and the totals equal the sum of the days", () => {
		// The week of the DST change, with an event across midnight at each end of the range.
		const from = at("00:00") - 7 * 86_400_000 - HOUR;
		const r = report({
			from,
			to: DAY[1],
			events: [
				ev("23:00", "23:00", { starts_at: from - HOUR, duration_ms: 2 * HOUR }),
				ev("23:00", "23:00", { starts_at: at("23:00"), duration_ms: 2 * HOUR }),
				ev("08:00", "12:00", { starts_at: at("08:00") - 6 * 86_400_000, rrule: "FREQ=DAILY" }),
			],
			entries: [tagged("07:00", "09:00"), { started_at: from - HOUR, ended_at: from + 5 * HOUR, tagIds: [] }],
		});
		expect(r.days).toHaveLength(8);
		const sum = (key: "trackedMs" | "plannedMs" | "coveredMs") => r.days.reduce((s, d) => s + d[key], 0);
		expect(sum("trackedMs")).toBe(r.totals.trackedMs);
		expect(sum("plannedMs")).toBe(r.totals.plannedMs);
		expect(sum("coveredMs")).toBe(r.totals.coveredMs);
		// 1 h + 1 h of the two midnight events, and 7 daily events of 4 h.
		expect(r.totals.plannedMs).toBe(30 * HOUR);
	});

	test("tags: an entry counts for each of its tags; no tag is Untagged; shared time counts once", () => {
		const r = report({
			entries: [tagged("09:00", "11:00", ["a", "b"]), tagged("10:00", "12:00", ["a"]), tagged("13:00", "14:00")],
		});
		expect(r.tags).toEqual([
			{ tagId: "a", ms: 3 * HOUR },
			{ tagId: "b", ms: 2 * HOUR },
			{ tagId: null, ms: HOUR },
		]);
	});

	test("all-day events are left out unless included", () => {
		const allDay = ev("00:00", "00:00", { starts_at: DAY[0], duration_ms: 86_400_000, all_day: 1 });
		expect(report({ events: [allDay] }).events).toEqual([]);
		expect(report({ events: [allDay], includeAllDay: true }).totals.plannedMs).toBe(86_400_000);
	});

	test("apps: activity is clipped to tracked time, and summed per event", () => {
		const r = report({
			events: [ev("08:00", "12:00")],
			entries: [tagged("09:00", "11:00")],
			activity: [
				{ app_id: "code", started_at: at("09:00"), ended_at: at("10:30") },
				// Partly outside the entry (the entry was shortened after the activity was recorded).
				{ app_id: "mail", started_at: at("10:30"), ended_at: at("11:30") },
			],
			apps: [
				{ id: "code", display_name: "Code" },
				{ id: "mail", display_name: "Mail" },
			],
		});
		expect(r.apps).toEqual([
			{ appId: "code", name: "Code", ms: 1.5 * HOUR },
			{ appId: "mail", name: "Mail", ms: 0.5 * HOUR },
		]);
		expect(r.events[0].apps).toEqual([
			{ appId: "code", ms: 1.5 * HOUR },
			{ appId: "mail", ms: 0.5 * HOUR },
		]);
	});
});
