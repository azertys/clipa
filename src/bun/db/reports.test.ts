import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testDb } from "../test-helpers";
import { writeNewFile } from "../services/files";
import { deleteEntry, saveEntry } from "./entries";
import { saveNewEvent } from "./events";
import { loadReport } from "./reports";
import { saveTag } from "./tags";

const TZ = "Europe/Bucharest";
const at = (hhmm: string) => Date.parse(`2026-10-26T${hhmm}:00+02:00`);
const HOUR = 3_600_000;
const DAY = { from: at("00:00"), to: at("00:00") + 24 * HOUR, tzid: TZ, includeAllDay: false };

describe("loadReport", () => {
	test("reads entries, tags, events and activity from the database", () => {
		const { db, ctx, setNow } = testDb();
		setNow(at("20:00"));
		const work = saveTag(db, ctx, { name: "Work" });
		const e = saveEntry(db, ctx, { started_at: at("09:00"), ended_at: at("11:00"), note: "", tagIds: [work.id] });
		const gone = saveEntry(db, ctx, { started_at: at("13:00"), ended_at: at("14:00"), note: "", tagIds: [] });
		deleteEntry(db, ctx, gone.id);
		saveNewEvent(
			db,
			ctx,
			{ title: "Focus", notes: "", color: null, start: at("08:00"), end: at("12:00"), allDay: false, rrule: null },
			TZ,
		);
		db.query("INSERT INTO apps (id, platform_key, display_name) VALUES ('a1', 'com.example.code', 'Code')").run();
		db.query(
			"INSERT INTO activity (id, entry_id, app_id, window_title, started_at, ended_at) VALUES (?, ?, 'a1', NULL, ?, ?)",
		).run("act1", e.id, at("09:00"), at("10:00"));
		db.query(
			"INSERT INTO activity (id, entry_id, app_id, window_title, started_at, ended_at) VALUES (?, ?, 'a1', NULL, ?, ?)",
		).run("act2", gone.id, at("13:00"), at("14:00"));

		const r = loadReport(db, DAY, ctx.now());
		expect(r.totals).toEqual({ trackedMs: 2 * HOUR, plannedMs: 4 * HOUR, coveredMs: 2 * HOUR, outsideEventsMs: 0 });
		expect(r.events).toEqual([expect.objectContaining({ title: "Focus", trackedMs: 2 * HOUR, coverage: 0.5 })]);
		expect(r.tags).toEqual([{ tagId: work.id, ms: 2 * HOUR }]);
		// The activity of the deleted entry does not count.
		expect(r.apps).toEqual([{ appId: "a1", name: "Code", ms: HOUR, titles: [] }]);
	});

	test("an empty or reversed range is refused", () => {
		const { db, ctx } = testDb();
		expect(() => loadReport(db, { ...DAY, to: DAY.from }, ctx.now())).toThrow("REPORT_RANGE_INVALID");
	});
});

describe("writeNewFile", () => {
	test("never replaces an existing file", () => {
		const dir = mkdtempSync(join(tmpdir(), "clipa-test-"));
		try {
			const first = writeNewFile(dir, "report.csv", "one");
			const second = writeNewFile(dir, "report.csv", "two");
			expect(first).toBe(join(dir, "report.csv"));
			expect(second).toBe(join(dir, "report (2).csv"));
			expect(readFileSync(first, "utf8")).toBe("one");
			expect(readFileSync(second, "utf8")).toBe("two");
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});
