import { describe, expect, test } from "bun:test";
import { csv, csvField, entriesCsv, exportFileName, hours, reportCsv } from "./export";
import type { EntryWithTags } from "./types";
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

	test("columns named as quoted are always quoted, the header never", () => {
		expect(csv(["a", "note"], [["1", "x"]], ["note"])).toBe('﻿a,note\r\n1,"x"\r\n');
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

describe("entries table", () => {
	const sync = { created_at: 0, updated_at: 0, deleted_at: null, device_id: "a" };
	const entry = (start: string, end: string | null, note: string, tagIds: string[]): EntryWithTags => ({
		id: start,
		started_at: Date.parse(start),
		ended_at: end === null ? null : Date.parse(end),
		note,
		tagIds,
		...sync,
	});
	const names: Record<string, string> = { t1: "Work", t2: "Client, Inc" };
	const opts = { tzid: "Europe/Bucharest", now: Date.parse("2026-10-26T12:00:00+02:00"), tagName: (id: string) => names[id] };

	test("local times with the offset, tags with ';', the note quoted", () => {
		const text = entriesCsv([entry("2026-10-26T09:00:00+02:00", "2026-10-26T10:30:00+02:00", 'Fix "login"', ["t1", "t2"])], opts);
		expect(text).toBe(
			"﻿date,start,end,duration_hm,duration_hours,tags,note\r\n" +
				'2026-10-26,2026-10-26T09:00:00+02:00,2026-10-26T10:30:00+02:00,1:30,1.50,"Work;Client, Inc","Fix ""login"""\r\n',
		);
	});

	test("the date is the local date of the start, across midnight and DST", () => {
		const text = entriesCsv([entry("2026-10-24T22:00:00Z", "2026-10-25T03:00:00Z", "", [])], opts);
		// 01:00 on 25 Oct local (+03:00) to 05:00 local, after the change to +02:00: 5 hours.
		expect(text.split("\r\n")[1]).toBe('2026-10-25,2026-10-25T01:00:00+03:00,2026-10-25T05:00:00+02:00,5:00,5.00,,""');
	});

	test("a running entry has no end and counts up to now", () => {
		const text = entriesCsv([entry("2026-10-26T11:15:00+02:00", null, "", [])], opts);
		expect(text.split("\r\n")[1]).toBe('2026-10-26,2026-10-26T11:15:00+02:00,,0:45,0.75,,""');
	});
});
