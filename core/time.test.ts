import { describe, expect, test } from "bun:test";
import {
	HOUR,
	MINUTE,
	addLocalDays,
	atLocalMinutes,
	dateRange,
	formatClock,
	formatDuration,
	formatElapsed,
	formatPercent,
	fromLocalInput,
	isoLocal,
	localDate,
	localDateStart,
	localMinutes,
	parseClock,
	parseDuration,
	presetRange,
	startOfLocalDay,
	startOfLocalMonth,
	startOfLocalWeek,
	toLocalInput,
	type RangePreset,
} from "./time";

const TZ = "Europe/Bucharest";
const utc = (iso: string) => Date.parse(iso);

describe("formatting", () => {
	test("formatDuration gives H:MM and rounds down", () => {
		expect(formatDuration(0)).toBe("0:00");
		expect(formatDuration(90 * MINUTE)).toBe("1:30");
		expect(formatDuration(2 * HOUR + 59_999)).toBe("2:00");
		expect(formatDuration(27 * HOUR + 5 * MINUTE)).toBe("27:05");
		expect(formatDuration(-5)).toBe("0:00");
	});

	test("formatElapsed gives H:MM:SS", () => {
		expect(formatElapsed(0)).toBe("0:00:00");
		expect(formatElapsed(HOUR + 2 * MINUTE + 3_999)).toBe("1:02:03");
	});

	test("formatPercent has one decimal", () => {
		expect(formatPercent(0.5)).toBe("50.0%");
		expect(formatPercent(0.75)).toBe("75.0%");
		expect(formatPercent(1)).toBe("100.0%");
		expect(formatPercent(1 / 3)).toBe("33.3%");
	});
});

describe("local days", () => {
	test("formatClock and localDate use the zone", () => {
		// 2026-10-24 05:00Z is 08:00 EEST (UTC+3)
		expect(formatClock(utc("2026-10-24T05:00:00Z"), TZ)).toBe("08:00");
		expect(localDate(utc("2026-10-24T21:30:00Z"), TZ)).toBe("2026-10-25");
	});

	test("startOfLocalDay and addLocalDays across the DST end", () => {
		const sat = utc("2026-10-24T09:00:00Z");
		expect(startOfLocalDay(sat, TZ)).toBe(utc("2026-10-23T21:00:00Z"));
		// Sunday 2026-10-25 has 25 hours in Bucharest.
		const sun = addLocalDays(sat, 1, TZ);
		const mon = addLocalDays(sat, 2, TZ);
		expect(sun).toBe(utc("2026-10-24T21:00:00Z"));
		expect(mon).toBe(utc("2026-10-25T22:00:00Z"));
		expect(mon - sun).toBe(25 * HOUR);
	});

	test("localDateStart", () => {
		expect(localDateStart("2026-03-29", TZ)).toBe(utc("2026-03-28T22:00:00Z"));
	});

	test("startOfLocalWeek is Monday", () => {
		// Sunday 2026-10-25 → Monday 2026-10-19
		expect(startOfLocalWeek(utc("2026-10-25T12:00:00Z"), TZ)).toBe(utc("2026-10-18T21:00:00Z"));
		// Monday itself
		expect(startOfLocalWeek(utc("2026-10-26T08:00:00Z"), TZ)).toBe(utc("2026-10-25T22:00:00Z"));
	});

	test("isoLocal has the offset", () => {
		expect(isoLocal(utc("2026-10-26T07:00:00Z"), TZ)).toBe("2026-10-26T09:00:00+02:00");
		expect(isoLocal(utc("2026-10-24T07:00:00Z"), TZ)).toBe("2026-10-24T10:00:00+03:00");
	});
});

describe("datetime-local values", () => {
	test("round trip", () => {
		const ms = utc("2026-10-26T07:15:00Z");
		expect(toLocalInput(ms, TZ)).toBe("2026-10-26T09:15");
		expect(fromLocalInput("2026-10-26T09:15", TZ)).toBe(ms);
	});
	test("a time in the spring-forward gap moves forward", () => {
		expect(fromLocalInput("2026-03-29T03:30", TZ)).toBe(utc("2026-03-29T01:30:00Z"));
	});
	test("a time in the fall-back overlap takes the earlier instant", () => {
		expect(fromLocalInput("2026-10-25T03:30", TZ)).toBe(utc("2026-10-25T00:30:00Z"));
	});
	test("bad input", () => {
		expect(fromLocalInput("", TZ)).toBeNull();
		expect(fromLocalInput("not a date", TZ)).toBeNull();
	});
});

describe("report ranges", () => {
	// Monday 2026-10-26 10:00 local (+02:00). Summer time ended on Sunday 10-25.
	const now = utc("2026-10-26T08:00:00Z");
	const range = (preset: RangePreset) => {
		const r = presetRange(preset, now, TZ);
		return [new Date(r.from).toISOString(), new Date(r.to).toISOString()];
	};

	test("today, this week and last week", () => {
		expect(range("today")).toEqual(["2026-10-25T22:00:00.000Z", "2026-10-26T22:00:00.000Z"]);
		expect(range("thisWeek")).toEqual(["2026-10-25T22:00:00.000Z", "2026-11-01T22:00:00.000Z"]);
		// Last week has 7 local days and 169 hours: it contains the DST change.
		expect(range("lastWeek")).toEqual(["2026-10-18T21:00:00.000Z", "2026-10-25T22:00:00.000Z"]);
	});

	test("this month and last month", () => {
		expect(range("thisMonth")).toEqual(["2026-09-30T21:00:00.000Z", "2026-10-31T22:00:00.000Z"]);
		expect(range("lastMonth")).toEqual(["2026-08-31T21:00:00.000Z", "2026-09-30T21:00:00.000Z"]);
		expect(startOfLocalMonth(utc("2026-01-15T10:00:00Z"), TZ, -1)).toBe(utc("2025-11-30T22:00:00Z"));
	});

	test("a custom range includes both dates", () => {
		expect(dateRange("2026-10-24", "2026-10-25", TZ)).toEqual({
			from: utc("2026-10-23T21:00:00Z"),
			to: utc("2026-10-25T22:00:00Z"),
		});
	});
});

describe("12-hour clock, week start and parsing", () => {
	test("formatClock with hour12", () => {
		expect(formatClock(utc("2026-10-26T06:30:00Z"), TZ, true)).toBe("8:30 AM");
		expect(formatClock(utc("2026-10-26T10:05:00Z"), TZ, true)).toBe("12:05 PM");
		expect(formatClock(utc("2026-10-25T22:15:00Z"), TZ, true)).toBe("12:15 AM");
		expect(formatClock(utc("2026-10-26T19:00:00Z"), TZ, true)).toBe("9:00 PM");
	});

	test("weeks can start on Sunday", () => {
		// Monday 2026-10-26 → Sunday 2026-10-25. Sunday itself stays.
		expect(startOfLocalWeek(utc("2026-10-26T08:00:00Z"), TZ, 7)).toBe(utc("2026-10-24T21:00:00Z"));
		expect(startOfLocalWeek(utc("2026-10-25T12:00:00Z"), TZ, 7)).toBe(utc("2026-10-24T21:00:00Z"));
		expect(presetRange("thisWeek", utc("2026-10-26T08:00:00Z"), TZ, 7).from).toBe(utc("2026-10-24T21:00:00Z"));
	});

	test("parseClock", () => {
		expect(parseClock("13:05")).toBe(13 * 60 + 5);
		expect(parseClock(" 9.30 ")).toBe(9 * 60 + 30);
		expect(parseClock("0830")).toBe(8 * 60 + 30);
		expect(parseClock("24:00")).toBeNull();
		expect(parseClock("12:60")).toBeNull();
		expect(parseClock("noon")).toBeNull();
		expect(parseClock("9")).toBeNull();
	});

	test("parseClock with AM and PM", () => {
		expect(parseClock("8:30 PM")).toBe(20 * 60 + 30);
		expect(parseClock("8pm")).toBe(20 * 60);
		expect(parseClock("12:15 am")).toBe(15);
		expect(parseClock("12:00 PM")).toBe(12 * 60);
		expect(parseClock("13:00 PM")).toBeNull();
	});

	test("parseDuration", () => {
		expect(parseDuration("1:45")).toBe(105 * MINUTE);
		expect(parseDuration("105")).toBe(105 * MINUTE);
		expect(parseDuration("0:75")).toBeNull();
		expect(parseDuration("1h")).toBeNull();
	});

	test("atLocalMinutes and localMinutes", () => {
		expect(atLocalMinutes("2026-10-26", 9 * 60 + 15, TZ)).toBe(utc("2026-10-26T07:15:00Z"));
		// 03:30 on the spring-forward day moves to 04:30.
		expect(atLocalMinutes("2026-03-29", 3 * 60 + 30, TZ)).toBe(utc("2026-03-29T01:30:00Z"));
		expect(localMinutes(utc("2026-10-26T07:15:00Z"), TZ)).toBe(9 * 60 + 15);
	});
});
