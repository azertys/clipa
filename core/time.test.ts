import { describe, expect, test } from "bun:test";
import {
	HOUR,
	MINUTE,
	addLocalDays,
	formatClock,
	formatDuration,
	formatElapsed,
	formatPercent,
	fromLocalInput,
	isoLocal,
	localDate,
	localDateStart,
	startOfLocalDay,
	startOfLocalWeek,
	toLocalInput,
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
