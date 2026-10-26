import { describe, expect, test } from "bun:test";
import { entryInterval, firstLine, recentCombos, trackedMs, validateEntry } from "./entries";
import type { EntryWithTags } from "./types";

const HOUR = 3_600_000;

function entry(id: string, started_at: number, ended_at: number | null, note = "", tagIds: string[] = []): EntryWithTags {
	return {
		id,
		started_at,
		ended_at,
		note,
		tagIds,
		created_at: 0,
		updated_at: 0,
		deleted_at: null,
		device_id: "d",
	};
}

describe("entryInterval and trackedMs", () => {
	test("a running entry ends at now", () => {
		expect(entryInterval(entry("a", 9 * HOUR, null), 10.5 * HOUR)).toEqual({ start: 9 * HOUR, end: 10.5 * HOUR });
		expect(trackedMs([entry("a", 9 * HOUR, null)], 0, 24 * HOUR, 10.5 * HOUR)).toBe(1.5 * HOUR);
	});

	test("overlapping entries count once", () => {
		const entries = [entry("a", 9 * HOUR, 11 * HOUR), entry("b", 10 * HOUR, 12 * HOUR)];
		expect(trackedMs(entries, 0, 24 * HOUR, 0)).toBe(3 * HOUR);
	});

	test("clips to the range", () => {
		expect(trackedMs([entry("a", 22 * HOUR, 26 * HOUR)], 0, 24 * HOUR, 0)).toBe(2 * HOUR);
	});
});

describe("validateEntry", () => {
	test("end must be after start", () => {
		expect(validateEntry({ started_at: 10, ended_at: 10 }, 100)).toBe("end-before-start");
		expect(validateEntry({ started_at: 10, ended_at: 5 }, 100)).toBe("end-before-start");
		expect(validateEntry({ started_at: 10, ended_at: 11 }, 100)).toBeNull();
		expect(validateEntry({ started_at: 10, ended_at: null }, 100)).toBeNull();
	});
	test("start in the future", () => {
		expect(validateEntry({ started_at: 200, ended_at: 300 }, 100)).toBe("start-in-future");
	});
});

describe("firstLine", () => {
	test("first non-empty line, trimmed", () => {
		expect(firstLine("\n  Fix bug  \nmore")).toBe("Fix bug");
		expect(firstLine("")).toBe("");
	});
});

describe("recentCombos", () => {
	test("distinct note + tags, newest first, tag order ignored", () => {
		const entries = [
			entry("1", 1, 2, "Write spec", ["b", "a"]),
			entry("2", 3, 4, "Write spec", ["a", "b"]),
			entry("3", 5, 6, "Review", []),
			entry("4", 7, 8, "", []),
			entry("5", 9, 10, "Write spec", ["a"]),
		];
		expect(recentCombos(entries, 5)).toEqual([
			{ note: "Write spec", tagIds: ["a"] },
			{ note: "Review", tagIds: [] },
			{ note: "Write spec", tagIds: ["a", "b"] },
		]);
	});
	test("stops at the limit", () => {
		const entries = Array.from({ length: 10 }, (_, i) => entry(String(i), i, i + 1, `n${i}`));
		expect(recentCombos(entries, 5).map((c) => c.note)).toEqual(["n9", "n8", "n7", "n6", "n5"]);
	});
});
