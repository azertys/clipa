import { describe, expect, test } from "bun:test";
import {
	formatRule,
	formatUntil,
	NO_REPEAT,
	parseUntil,
	repeatFromRule,
	retargetRule,
	ruleFromRepeat,
	ruleParts,
	weekdayOf,
	type Repeat,
} from "./repeat";

const TZ = "Europe/Bucharest";
const utc = (iso: string) => Date.parse(iso);
const monday9 = utc("2026-10-05T06:00:00Z");

describe("rule parts", () => {
	test("split and join, FREQ first", () => {
		const parts = ruleParts("RRULE:interval=2;FREQ=weekly;BYDAY=MO,WE");
		expect([...parts.entries()]).toEqual([
			["INTERVAL", "2"],
			["FREQ", "WEEKLY"],
			["BYDAY", "MO,WE"],
		]);
		expect(formatRule(parts)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
	});

	test("a part without a value is an error", () => {
		expect(() => ruleParts("FREQ")).toThrow();
	});
});

describe("UNTIL", () => {
	test("format drops milliseconds", () => {
		expect(formatUntil(utc("2026-12-31T21:59:59.999Z"))).toBe("20261231T215959Z");
	});

	test("UTC, floating and date-only values", () => {
		expect(parseUntil("20261231T215959Z", TZ)).toBe(utc("2026-12-31T21:59:59Z"));
		expect(parseUntil("20261231T235959", TZ)).toBe(utc("2026-12-31T21:59:59Z"));
		expect(parseUntil("20261231", TZ)).toBe(utc("2026-12-31T22:00:00Z") - 1);
		expect(() => parseUntil("2026-12-31", TZ)).toThrow();
	});
});

describe("ruleFromRepeat", () => {
	const repeat = (r: Partial<Repeat>): Repeat => ({ ...NO_REPEAT, ...r });

	test("none is null", () => {
		expect(ruleFromRepeat(NO_REPEAT, monday9, TZ)).toBeNull();
	});

	test("each frequency", () => {
		expect(ruleFromRepeat(repeat({ freq: "daily", interval: 3 }), monday9, TZ)).toBe("FREQ=DAILY;INTERVAL=3");
		expect(ruleFromRepeat(repeat({ freq: "weekdays", interval: 4 }), monday9, TZ)).toBe(
			"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1",
		);
		expect(ruleFromRepeat(repeat({ freq: "weekly", days: ["FR", "MO", "WE"] }), monday9, TZ)).toBe(
			"FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1",
		);
		expect(ruleFromRepeat(repeat({ freq: "monthly", interval: 2 }), monday9, TZ)).toBe("FREQ=MONTHLY;INTERVAL=2");
		expect(ruleFromRepeat(repeat({ freq: "yearly" }), monday9, TZ)).toBe("FREQ=YEARLY;INTERVAL=1");
	});

	test("weekly without days uses the start's weekday", () => {
		expect(ruleFromRepeat(repeat({ freq: "weekly" }), monday9, TZ)).toBe("FREQ=WEEKLY;BYDAY=MO;INTERVAL=1");
	});

	test("end after N occurrences, and on a date (that local day included)", () => {
		expect(ruleFromRepeat(repeat({ freq: "daily", end: { kind: "count", count: 5 } }), monday9, TZ)).toBe(
			"FREQ=DAILY;INTERVAL=1;COUNT=5",
		);
		expect(ruleFromRepeat(repeat({ freq: "daily", end: { kind: "until", date: "2026-12-31" } }), monday9, TZ)).toBe(
			"FREQ=DAILY;INTERVAL=1;UNTIL=20261231T215959Z",
		);
	});

	test("custom keeps the raw rule", () => {
		expect(ruleFromRepeat(repeat({ freq: "custom", raw: "FREQ=MONTHLY;BYDAY=1MO" }), monday9, TZ)).toBe(
			"FREQ=MONTHLY;BYDAY=1MO",
		);
	});
});

describe("repeatFromRule", () => {
	test("round trip for every dialog option", () => {
		const cases: Repeat[] = [
			{ freq: "daily", interval: 2, days: [], end: { kind: "never" } },
			{ freq: "weekdays", interval: 1, days: [], end: { kind: "count", count: 10 } },
			{ freq: "weekly", interval: 1, days: ["MO", "WE", "FR"], end: { kind: "until", date: "2026-12-31" } },
			{ freq: "monthly", interval: 1, days: [], end: { kind: "never" } },
			{ freq: "yearly", interval: 5, days: [], end: { kind: "never" } },
		];
		for (const r of cases) expect(repeatFromRule(ruleFromRepeat(r, monday9, TZ), TZ)).toEqual(r);
		expect(repeatFromRule(null, TZ)).toEqual(NO_REPEAT);
	});

	test("an UNTIL in the middle of a day shows that local day", () => {
		expect(repeatFromRule("FREQ=DAILY;UNTIL=20261011T055959Z", TZ).end).toEqual({ kind: "until", date: "2026-10-11" });
	});

	test("rules the dialog cannot show are custom", () => {
		for (const rule of ["FREQ=MONTHLY;BYDAY=1MO", "FREQ=DAILY;BYHOUR=9", "FREQ=HOURLY", "FREQ=WEEKLY;WKST=SU"]) {
			expect(repeatFromRule(rule, TZ)).toMatchObject({ freq: "custom", raw: rule });
		}
	});
});

describe("retargetRule", () => {
	const tuesday9 = utc("2026-10-06T06:00:00Z");

	test("weekdays shift with the start", () => {
		expect(retargetRule("FREQ=WEEKLY;BYDAY=MO", monday9, tuesday9, TZ)).toBe("FREQ=WEEKLY;BYDAY=TU");
		expect(retargetRule("FREQ=WEEKLY;BYDAY=MO,WE,SU", monday9, tuesday9, TZ)).toBe("FREQ=WEEKLY;BYDAY=MO,TU,TH");
		expect(retargetRule("FREQ=MONTHLY;BYDAY=1MO", monday9, tuesday9, TZ)).toBe("FREQ=MONTHLY;BYDAY=1TU");
	});

	test("a move within the same day changes nothing", () => {
		expect(retargetRule("FREQ=WEEKLY;BYDAY=MO", monday9, monday9 + 3_600_000, TZ)).toBe("FREQ=WEEKLY;BYDAY=MO");
	});

	test("month day and month follow the start when they matched it", () => {
		expect(retargetRule("FREQ=MONTHLY;BYMONTHDAY=5", monday9, tuesday9, TZ)).toBe("FREQ=MONTHLY;BYMONTHDAY=6");
		expect(retargetRule("FREQ=MONTHLY;BYMONTHDAY=20", monday9, tuesday9, TZ)).toBe("FREQ=MONTHLY;BYMONTHDAY=20");
		expect(retargetRule("FREQ=YEARLY;BYMONTH=10", monday9, utc("2026-11-02T07:00:00Z"), TZ)).toBe(
			"FREQ=YEARLY;BYMONTH=11",
		);
	});

	test("weekdayOf uses the local day", () => {
		// Sunday 23:30 UTC is Monday 02:30 in Bucharest.
		expect(weekdayOf(utc("2026-10-04T23:30:00Z"), TZ)).toBe("MO");
	});
});
