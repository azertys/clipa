import { describe, expect, test } from "bun:test";
import {
	BackupError,
	backupFileName,
	backupsToDelete,
	countRow,
	dailyBackupName,
	emptySummary,
	importBackupName,
	latestDailyBackup,
	mergeAction,
	parseBackup,
} from "./backup";

const sync = { created_at: 1, updated_at: 1, deleted_at: null, device_id: "a" };

function file(tables: Record<string, unknown[]>, header: Record<string, unknown> = {}) {
	return JSON.stringify({
		format: "clipa-backup",
		version: 1,
		exportedAt: 10,
		deviceId: "a",
		tables: { tags: [], time_entries: [], entry_tags: [], events: [], event_exceptions: [], ...tables },
		...header,
	});
}

const reason = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		return e instanceof BackupError ? e.reason : `other: ${e}`;
	}
	return "no error";
};

describe("merge rule", () => {
	test("a row that is not here is added", () => {
		expect(mergeAction(null, { updated_at: 5, device_id: "a" })).toBe("add");
	});

	test("the newer updated_at wins", () => {
		expect(mergeAction({ updated_at: 5, device_id: "z" }, { updated_at: 6, device_id: "a" })).toBe("update");
		expect(mergeAction({ updated_at: 6, device_id: "a" }, { updated_at: 5, device_id: "z" })).toBe("skip");
	});

	test("on a tie the larger device_id wins", () => {
		expect(mergeAction({ updated_at: 5, device_id: "a" }, { updated_at: 5, device_id: "b" })).toBe("update");
		expect(mergeAction({ updated_at: 5, device_id: "b" }, { updated_at: 5, device_id: "a" })).toBe("skip");
	});

	test("the same version is skipped, so a second import changes nothing", () => {
		expect(mergeAction({ updated_at: 5, device_id: "a" }, { updated_at: 5, device_id: "a" })).toBe("skip");
	});

	test("a newer local delete stays deleted", () => {
		// The local row was deleted at 9; the backup has the live row from 5.
		expect(mergeAction({ updated_at: 9, device_id: "a" }, { updated_at: 5, device_id: "a" })).toBe("skip");
	});
});

describe("parseBackup", () => {
	test("reads a valid file and drops unknown fields", () => {
		const backup = parseBackup(
			file({
				tags: [{ id: "t1", name: "Work", color: null, ...sync, extra: "x" }],
				time_entries: [{ id: "e1", started_at: 1, ended_at: 2, note: "", ...sync }],
				entry_tags: [{ entry_id: "e1", tag_id: "t1", ...sync }],
			}),
		);
		expect(backup.tables.tags).toEqual([{ id: "t1", name: "Work", color: null, ...sync }]);
		expect(backup.tables.apps).toBeUndefined();
		expect(backup.exportedAt).toBe(10);
	});

	test("app data comes as a pair", () => {
		const entry = { id: "e1", started_at: 1, ended_at: 2, note: "", ...sync };
		const backup = parseBackup(
			file({
				time_entries: [entry],
				apps: [{ id: "a1", platform_key: "com.apple.Safari", display_name: "Safari" }],
				activity: [{ id: "x1", entry_id: "e1", app_id: "a1", window_title: null, started_at: 1, ended_at: 2 }],
			}),
		);
		expect(backup.tables.activity).toHaveLength(1);
		expect(reason(() => parseBackup(file({ apps: [] })))).toBe("invalid");
	});

	test("refuses what is not a Clipa backup", () => {
		expect(reason(() => parseBackup("not json"))).toBe("invalid");
		expect(reason(() => parseBackup(JSON.stringify({ format: "other" })))).toBe("invalid");
		expect(reason(() => parseBackup(file({}, { tables: null })))).toBe("invalid");
		expect(reason(() => parseBackup(file({ tags: "x" as never })))).toBe("invalid");
	});

	test("a newer format version asks for a newer app", () => {
		expect(reason(() => parseBackup(file({}, { version: 2 })))).toBe("version");
	});

	test("refuses rows with wrong or missing fields", () => {
		expect(reason(() => parseBackup(file({ tags: [{ id: "t1", name: 3, color: null, ...sync }] })))).toBe("invalid");
		expect(reason(() => parseBackup(file({ tags: [{ id: "t1", color: null, ...sync }] })))).toBe("invalid");
		expect(reason(() => parseBackup(file({ tags: [{ id: "t1", name: "x", color: null, ...sync, updated_at: 1.5 }] })))).toBe(
			"invalid",
		);
	});

	test("refuses references to rows that are not in the file", () => {
		expect(reason(() => parseBackup(file({ entry_tags: [{ entry_id: "e1", tag_id: "t1", ...sync }] })))).toBe("invalid");
		const exception = {
			id: "x1",
			event_id: "missing",
			original_start: 1,
			kind: "cancelled",
			new_starts_at: null,
			new_duration_ms: null,
			new_title: null,
			new_notes: null,
			...sync,
		};
		expect(reason(() => parseBackup(file({ event_exceptions: [exception] })))).toBe("invalid");
	});

	test("refuses an entry that ends before it starts", () => {
		const entry = { id: "e1", started_at: 5, ended_at: 5, note: "", ...sync };
		expect(reason(() => parseBackup(file({ time_entries: [entry] })))).toBe("invalid");
	});
});

describe("summary", () => {
	test("counts per table and in total", () => {
		const s = emptySummary("/b.db");
		countRow(s, "tags", "add");
		countRow(s, "time_entries", "update");
		countRow(s, "time_entries", "skip");
		expect([s.added, s.updated, s.skipped]).toEqual([1, 1, 1]);
		expect(s.tables.time_entries).toEqual({ added: 0, updated: 1, skipped: 1 });
	});
});

describe("backup files", () => {
	test("names", () => {
		expect(backupFileName("2026-10-26")).toBe("clipa-backup-2026-10-26.json");
		expect(dailyBackupName("2026-10-26")).toBe("clipa-2026-10-26.db");
		expect(importBackupName("2026-10-26", "153012")).toBe("clipa-before-import-2026-10-26-153012.db");
	});

	test("keeps the newest copies of one kind and never lists other files", () => {
		const days = Array.from({ length: 16 }, (_, i) => dailyBackupName(`2026-10-${String(i + 1).padStart(2, "0")}`));
		const names = [...days, "notes.txt", "clipa.db", importBackupName("2026-10-01", "120000")];
		expect(backupsToDelete(names, "daily")).toEqual(["clipa-2026-10-02.db", "clipa-2026-10-01.db"]);
		expect(backupsToDelete(names, "import")).toEqual([]);
		expect(backupsToDelete(names, "import", 0)).toEqual(["clipa-before-import-2026-10-01-120000.db"]);
	});

	test("the latest daily copy", () => {
		expect(latestDailyBackup(["clipa-2026-10-25.db", "clipa-2026-10-26.db", "x.db"])).toBe("clipa-2026-10-26.db");
		expect(latestDailyBackup(["x.db"])).toBeNull();
	});
});
