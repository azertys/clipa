import { describe, expect, test } from "bun:test";
import { csv, csvField, exportFileName, hours, reportCsv } from "./export";
import type { Report } from "./reports";

const at = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00+02:00`);
const HOUR = 3_600_000;

describe("CSV", () => {
	test("fields are quoted only when needed, or when asked", () => {
		expect(csvField("plain")).toBe("plain");
		expect(csvField('say "hi", then\nleave')).toBe('"say ""hi"", then\nleave"');
		expect(csvField("note", true)).toBe('"note"');
		expect(csvField(1.5)).toBe("1.5");
	});

	test("a table has a BOM, CRLF line ends and a final line end", () => {
		expect(csv(["a", "b"], [["1", "x,y"]])).toBe('﻿a,b\r\n1,"x,y"\r\n');
	});

	test("hours have two decimals", () => {
		expect(hours(90 * 60_000)).toBe("1.50");
		expect(hours(0)).toBe("0.00");
	});

	test("file names", () => {
		expect(exportFileName("events", "2026-10-01", "2026-10-31")).toBe("clipa-events-2026-10-01_2026-10-31.csv");
		expect(exportFileName("tags", "2026-10-26", "2026-10-26")).toBe("clipa-tags-2026-10-26.csv");
	});
});

describe("report tables", () => {
	const report: Report = {
		range: { from: at("00:00"), to: at("00:00") + 24 * HOUR, tzid: "Europe/Bucharest" },
		entryCount: 1,
		totals: { trackedMs: 2 * HOUR, plannedMs: 4 * HOUR, coveredMs: 2 * HOUR, outsideEventsMs: 0 },
		days: [{ date: "2026-10-26", trackedMs: 2 * HOUR, plannedMs: 4 * HOUR, coveredMs: 2 * HOUR }],
		events: [
			{
				eventId: "e1",
				originalStart: at("08:00"),
				title: "Planning, part 1",
				color: null,
				allDay: false,
				recurring: false,
				start: at("08:00"),
				end: at("12:00"),
				partial: false,
				plannedMs: 4 * HOUR,
				trackedMs: 2 * HOUR,
				coverage: 0.5,
				segments: [],
				apps: [],
			},
		],
		tags: [
			{ tagId: "t1", ms: 90 * 60_000 },
			{ tagId: null, ms: 30 * 60_000 },
		],
		apps: [{ appId: "a1", name: "Code", ms: 2 * HOUR, titles: [] }],
	};
	const names = { tagName: (id: string) => (id === "t1" ? "Work" : id), untagged: "Untagged" };
	const lines = (table: Parameters<typeof reportCsv>[1]) => reportCsv(report, table, names).slice(1).split("\r\n");

	test("events: local times with offset, quoted title, coverage with one decimal", () => {
		expect(lines("events")).toEqual([
			"start,end,title,planned_hm,planned_hours,tracked_hm,tracked_hours,coverage_percent,partial",
			'2026-10-26T08:00:00+02:00,2026-10-26T12:00:00+02:00,"Planning, part 1",4:00,4.00,2:00,2.00,50.0,false',
			"",
		]);
	});

	test("days, tags and apps", () => {
		expect(lines("days")[1]).toBe("2026-10-26,2:00,2.00,4:00,4.00,2:00,2.00");
		expect(lines("tags").slice(1, 3)).toEqual(["Work,1:30,1.50", "Untagged,0:30,0.50"]);
		expect(lines("apps")[1]).toBe("Code,2:00,2.00");
	});
});
