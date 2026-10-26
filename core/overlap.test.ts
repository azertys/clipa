import { describe, expect, test } from "bun:test";
import { clip, intersect, length, merge, overlappingIds, splitByLocalDay, subtract } from "./overlap";

const iv = (start: number, end: number) => ({ start, end });

describe("clip", () => {
	test("cuts to the range and drops empty parts", () => {
		expect(clip([iv(0, 10), iv(20, 30), iv(40, 50)], 5, 25)).toEqual([iv(5, 10), iv(20, 25)]);
		expect(clip([iv(0, 5)], 5, 10)).toEqual([]);
	});
});

describe("merge", () => {
	test("sorts, joins overlapping and touching intervals", () => {
		expect(merge([iv(10, 20), iv(0, 5), iv(5, 8), iv(15, 25), iv(30, 30)])).toEqual([iv(0, 8), iv(10, 25)]);
	});
	test("does not change the input", () => {
		const input = [iv(0, 10), iv(5, 15)];
		merge(input);
		expect(input).toEqual([iv(0, 10), iv(5, 15)]);
	});
	test("contained intervals", () => {
		expect(merge([iv(0, 100), iv(10, 20), iv(30, 40)])).toEqual([iv(0, 100)]);
	});
});

describe("intersect", () => {
	test("returns shared time", () => {
		expect(intersect([iv(0, 10), iv(20, 30)], [iv(5, 25)])).toEqual([iv(5, 10), iv(20, 25)]);
	});
	test("touching intervals share nothing", () => {
		expect(intersect([iv(0, 10)], [iv(10, 20)])).toEqual([]);
	});
	test("one long interval against many", () => {
		expect(intersect([iv(0, 100)], [iv(10, 20), iv(30, 40), iv(90, 120)])).toEqual([
			iv(10, 20),
			iv(30, 40),
			iv(90, 100),
		]);
	});
	test("empty inputs", () => {
		expect(intersect([], [iv(0, 1)])).toEqual([]);
	});
});

describe("subtract", () => {
	test("removes b from a", () => {
		expect(subtract([iv(0, 100)], [iv(10, 20), iv(30, 40)])).toEqual([iv(0, 10), iv(20, 30), iv(40, 100)]);
	});
	test("b covers a", () => {
		expect(subtract([iv(10, 20)], [iv(0, 30)])).toEqual([]);
	});
	test("b outside a", () => {
		expect(subtract([iv(10, 20)], [iv(0, 5), iv(25, 30)])).toEqual([iv(10, 20)]);
	});
	test("b spans several a", () => {
		expect(subtract([iv(0, 10), iv(20, 30), iv(40, 50)], [iv(5, 45)])).toEqual([iv(0, 5), iv(45, 50)]);
	});
});

describe("length", () => {
	test("sums lengths", () => {
		expect(length([iv(0, 10), iv(20, 25)])).toBe(15);
		expect(length([])).toBe(0);
	});
});

describe("splitByLocalDay", () => {
	const TZ = "Europe/Bucharest";
	const utc = (s: string) => Date.parse(s);
	test("entry 22:00–02:00 local splits at local midnight", () => {
		// 2026-10-26 22:00 EET = 20:00Z, 2026-10-27 02:00 EET = 00:00Z
		const parts = splitByLocalDay([iv(utc("2026-10-26T20:00:00Z"), utc("2026-10-27T00:00:00Z"))], TZ);
		expect(parts).toEqual([
			{ start: utc("2026-10-26T20:00:00Z"), end: utc("2026-10-26T22:00:00Z"), date: "2026-10-26" },
			{ start: utc("2026-10-26T22:00:00Z"), end: utc("2026-10-27T00:00:00Z"), date: "2026-10-27" },
		]);
	});
	test("a 25-hour local day stays one piece", () => {
		const start = utc("2026-10-24T21:00:00Z"); // Sunday 00:00 EEST
		const end = utc("2026-10-25T22:00:00Z"); // Monday 00:00 EET
		expect(splitByLocalDay([iv(start, end)], TZ)).toEqual([{ start, end, date: "2026-10-25" }]);
	});
});

describe("overlappingIds", () => {
	const item = (id: string, start: number, end: number) => ({ id, start, end });
	test("marks both sides of each overlap", () => {
		const ids = overlappingIds([item("a", 0, 10), item("b", 5, 15), item("c", 20, 30), item("d", 30, 40)]);
		expect([...ids].sort()).toEqual(["a", "b"]);
	});
	test("a short entry inside a long one, after a non-overlapping one", () => {
		const ids = overlappingIds([item("a", 0, 5), item("b", 6, 10), item("c", 7, 8)]);
		expect([...ids].sort()).toEqual(["b", "c"]);
	});
	test("contained entries", () => {
		const ids = overlappingIds([item("a", 0, 100), item("b", 10, 20), item("c", 30, 40)]);
		expect([...ids].sort()).toEqual(["a", "b", "c"]);
	});
});
