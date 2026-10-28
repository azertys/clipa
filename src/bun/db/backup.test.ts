import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_TABLE_NAMES, BACKUP_FIELDS, SYNC_TABLE_NAMES, type Backup } from "../../../core/backup";
import type { EventFields } from "../../../core/types";
import { testDb } from "../test-helpers";
import { appFor, writeSegment } from "./activity";
import { copyDatabase, exportBackup, importBackup, parseBackupFile } from "./backup";
import { openDatabase } from "./database";
import { getEntry, saveEntry, setEntryTags } from "./entries";
import { deleteEventOccurrence, editEventOccurrence, saveNewEvent } from "./events";
import { SYNC_TABLES, writeRow, type WriteContext } from "./repo";
import { deleteTag, saveTag } from "./tags";

const TZ = "Europe/Bucharest";
const HOUR = 3_600_000;
const MON = Date.parse("2026-10-05T06:00:00Z");
const TABLES = [...SYNC_TABLE_NAMES, ...APP_TABLE_NAMES];

/** Row count and a SHA-256 of all rows in key order, per table. */
function checksums(db: Database) {
	const out: Record<string, { rows: number; sha: string }> = {};
	for (const table of TABLES) {
		const rows = db.query(`SELECT ${Object.keys(BACKUP_FIELDS[table]).join(", ")} FROM ${table} ORDER BY 1, 2`).all();
		out[table] = { rows: rows.length, sha: new Bun.CryptoHasher("sha256").update(JSON.stringify(rows)).digest("hex") };
	}
	return out;
}

/** A running entry, as the timer writes it. */
function running(db: Database, ctx: WriteContext, startedAt: number, note: string, tagIds: string[] = []) {
	const id = Bun.randomUUIDv7();
	writeRow(db, ctx, "time_entries", { id, started_at: startedAt, ended_at: null, note });
	setEntryTags(db, ctx, id, tagIds);
	return getEntry(db, id)!;
}

const fields = (partial: Partial<EventFields> = {}): EventFields => ({
	title: "Standup",
	notes: "",
	color: null,
	start: MON,
	end: MON + HOUR,
	allDay: false,
	rrule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=1",
	...partial,
});

/** A database with one row of every kind: deleted rows, exceptions, a running entry and app data. */
function filled() {
	const t = testDb();
	const { db, ctx } = t;
	const work = saveTag(db, ctx, { name: "Work", color: "#ff0000" });
	const old = saveTag(db, ctx, { name: "Old" });
	t.advance(1000);
	const done = saveEntry(db, ctx, { started_at: MON, ended_at: MON + HOUR, note: "Report, \"draft\"", tagIds: [work.id, old.id] });
	deleteTag(db, ctx, old.id);
	const gone = saveEntry(db, ctx, { started_at: MON + 2 * HOUR, ended_at: MON + 3 * HOUR, note: "", tagIds: [] });
	writeRow(db, ctx, "time_entries", { ...getEntry(db, gone.id)!, deleted_at: ctx.now() });
	running(db, ctx, ctx.now() - HOUR, "running", [work.id]);
	const event = saveNewEvent(db, ctx, fields(), TZ);
	editEventOccurrence(db, ctx, { eventId: event.id, originalStart: MON + 7 * 24 * HOUR, mode: "this", changes: { title: "Moved" } });
	deleteEventOccurrence(db, ctx, { eventId: event.id, originalStart: MON + 14 * 24 * HOUR, mode: "this" });
	const app = appFor(db, "com.apple.Safari", "Safari");
	writeSegment(db, done.id, app.id, { id: "seg-1", appKey: "com.apple.Safari", appName: "Safari", title: "Docs", start: MON, end: MON + 60_000 });
	return { ...t, work };
}

const roundTrip = (backup: Backup) => parseBackupFile(JSON.stringify(backup));

describe("backup export and import", () => {
	test("export → empty database → import gives the same rows and checksums", () => {
		const source = filled();
		const backup = roundTrip(exportBackup(source.db, source.ctx, true));
		const target = testDb();
		target.ctx.deviceId = "device-b";
		const summary = importBackup(target.db, target.ctx, backup, "/b.db");
		expect(checksums(target.db)).toEqual(checksums(source.db));
		expect(summary.skipped).toBe(0);
		expect(summary.added).toBe(Object.values(checksums(source.db)).reduce((n, t) => n + t.rows, 0));
	});

	test("importing the same file twice changes nothing", () => {
		const source = filled();
		const backup = roundTrip(exportBackup(source.db, source.ctx, true));
		const target = testDb();
		importBackup(target.db, target.ctx, backup, "/b.db");
		const before = checksums(target.db);
		const second = importBackup(target.db, target.ctx, backup, "/b.db");
		expect(checksums(target.db)).toEqual(before);
		expect([second.added, second.updated]).toEqual([0, 0]);
	});

	test("importing a backup of this database changes nothing", () => {
		const s = filled();
		const before = checksums(s.db);
		const summary = importBackup(s.db, s.ctx, roundTrip(exportBackup(s.db, s.ctx, true)), "/b.db");
		expect(checksums(s.db)).toEqual(before);
		expect([summary.added, summary.updated]).toEqual([0, 0]);
	});

	test("without app data the file has no apps or activity", () => {
		const s = filled();
		const backup = exportBackup(s.db, s.ctx, false);
		expect(backup.tables.apps).toBeUndefined();
		expect(backup.tables.time_entries).toHaveLength(3);
		expect(backup.tables.tags.find((t) => t.name === "Old")?.deleted_at).not.toBeNull();
	});

	test("the backup columns are the database columns", () => {
		const { db } = testDb();
		for (const table of TABLES) {
			const cols = (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
			expect(Object.keys(BACKUP_FIELDS[table]).sort()).toEqual(cols.sort());
		}
		for (const table of SYNC_TABLE_NAMES) {
			expect(Object.keys(BACKUP_FIELDS[table]).slice(0, SYNC_TABLES[table].columns.length)).toEqual([...SYNC_TABLES[table].columns]);
		}
	});
});

describe("import merge", () => {
	function twoDevices() {
		const a = testDb();
		const b = testDb();
		b.ctx.deviceId = "device-b";
		return { a, b };
	}

	test("the newer updated_at wins, in both directions", () => {
		const { a, b } = twoDevices();
		const tag = saveTag(a.db, a.ctx, { name: "Work" });
		importBackup(b.db, b.ctx, exportBackup(a.db, a.ctx, false), "/b.db");
		b.advance(1000);
		saveTag(b.db, b.ctx, { id: tag.id, name: "Work (B)" });
		const toA = importBackup(a.db, a.ctx, exportBackup(b.db, b.ctx, false), "/b.db");
		expect(toA.tables.tags.updated).toBe(1);
		expect((a.db.query("SELECT name FROM tags").get() as { name: string }).name).toBe("Work (B)");
		const toB = importBackup(b.db, b.ctx, exportBackup(a.db, a.ctx, false), "/b.db");
		expect(toB.tables.tags).toEqual({ added: 0, updated: 0, skipped: 1 });
	});

	test("on a tie the larger device_id wins", () => {
		const { a, b } = twoDevices();
		// Same id, same updated_at, written on two devices.
		const tag = saveTag(a.db, a.ctx, { name: "A" });
		writeRow(b.db, b.ctx, "tags", { id: tag.id, name: "B", color: null });
		importBackup(a.db, a.ctx, exportBackup(b.db, b.ctx, false), "/b.db");
		importBackup(b.db, b.ctx, exportBackup(a.db, a.ctx, false), "/b.db");
		const names = [a, b].map((d) => (d.db.query("SELECT name FROM tags").get() as { name: string }).name);
		expect(names).toEqual(["B", "B"]);
	});

	test("a soft-deleted row stays deleted", () => {
		const a = testDb();
		const entry = saveEntry(a.db, a.ctx, { started_at: MON, ended_at: MON + HOUR, note: "x", tagIds: [] });
		const backup = exportBackup(a.db, a.ctx, false);
		a.advance(1000);
		writeRow(a.db, a.ctx, "time_entries", { ...getEntry(a.db, entry.id)!, deleted_at: a.ctx.now() });
		importBackup(a.db, a.ctx, backup, "/b.db");
		expect(getEntry(a.db, entry.id)?.deleted_at).not.toBeNull();
	});

	test("a tag with a local tag's name merges into it", () => {
		const { a, b } = twoDevices();
		const local = saveTag(a.db, a.ctx, { name: "Work" });
		const theirs = saveTag(b.db, b.ctx, { name: "work" });
		const entry = saveEntry(b.db, b.ctx, { started_at: MON, ended_at: MON + HOUR, note: "", tagIds: [theirs.id] });
		const backup = exportBackup(b.db, b.ctx, false);
		const summary = importBackup(a.db, a.ctx, backup, "/b.db");
		expect(summary.mergedTags).toBe(1);
		expect(getEntry(a.db, entry.id)?.tagIds).toEqual([local.id]);
		expect(a.db.query("SELECT count(*) AS n FROM tags").get()).toEqual({ n: 1 });
		const before = checksums(a.db);
		importBackup(a.db, a.ctx, backup, "/b.db");
		expect(checksums(a.db)).toEqual(before);
	});

	test("an imported running entry is closed when one runs here", () => {
		const { a, b } = twoDevices();
		const mine = running(a.db, a.ctx, MON, "mine");
		b.advance(10 * 60_000);
		const theirs = running(b.db, b.ctx, MON + 60_000, "theirs");
		const backup = exportBackup(b.db, b.ctx, false);
		const summary = importBackup(a.db, a.ctx, backup, "/b.db");
		expect(summary.closedEntries).toBe(1);
		expect(getEntry(a.db, mine.id)?.ended_at).toBeNull();
		expect(getEntry(a.db, theirs.id)?.ended_at).toBe(theirs.updated_at);
		const before = checksums(a.db);
		const second = importBackup(a.db, a.ctx, backup, "/b.db");
		expect(checksums(a.db)).toEqual(before);
		expect(second.closedEntries).toBe(0);
	});

	test("a running entry comes in running when nothing runs here", () => {
		const { a, b } = twoDevices();
		const theirs = running(b.db, b.ctx, MON, "");
		importBackup(a.db, a.ctx, exportBackup(b.db, b.ctx, false), "/b.db");
		expect(getEntry(a.db, theirs.id)?.ended_at).toBeNull();
	});

	test("one live exception per occurrence: the newer one stays", () => {
		const { a, b } = twoDevices();
		const event = saveNewEvent(a.db, a.ctx, fields(), TZ);
		importBackup(b.db, b.ctx, exportBackup(a.db, a.ctx, false), "/b.db");
		const occurrence = { eventId: event.id, originalStart: MON, mode: "this" as const };
		editEventOccurrence(a.db, a.ctx, { ...occurrence, changes: { title: "A" } });
		b.advance(1000);
		editEventOccurrence(b.db, b.ctx, { ...occurrence, changes: { title: "B" } });
		importBackup(a.db, a.ctx, exportBackup(b.db, b.ctx, false), "/b.db");
		const live = a.db.query("SELECT new_title FROM event_exceptions WHERE deleted_at IS NULL").all();
		expect(live).toEqual([{ new_title: "B" }]);
		const before = checksums(a.db);
		importBackup(a.db, a.ctx, exportBackup(b.db, b.ctx, false), "/b.db");
		expect(checksums(a.db)).toEqual(before);
	});

	test("the import is one transaction: an error writes nothing", () => {
		const { a, b } = twoDevices();
		saveTag(b.db, b.ctx, { name: "Work" });
		saveNewEvent(b.db, b.ctx, fields(), TZ);
		const backup = exportBackup(b.db, b.ctx, false);
		backup.tables.events[0].duration_ms = 0; // CHECK (duration_ms > 0)
		expect(() => importBackup(a.db, a.ctx, roundTrip(backup), "/b.db")).toThrow();
		expect(a.db.query("SELECT count(*) AS n FROM tags").get()).toEqual({ n: 0 });
	});

	test("a file that is not a backup gives an error code", () => {
		expect(() => parseBackupFile("{}")).toThrow("BACKUP_INVALID");
		expect(() => parseBackupFile(JSON.stringify({ format: "clipa-backup", version: 9 }))).toThrow("BACKUP_VERSION");
	});
});

describe("database copy", () => {
	test("VACUUM INTO writes a database with the same rows", () => {
		const s = filled();
		const path = join(tmpdir(), `clipa-copy-${Bun.randomUUIDv7()}.db`);
		try {
			copyDatabase(s.db, path);
			const copy = openDatabase(path);
			expect(checksums(copy)).toEqual(checksums(s.db));
			copy.close();
		} finally {
			rmSync(path, { force: true });
			rmSync(`${path}-wal`, { force: true });
			rmSync(`${path}-shm`, { force: true });
		}
	});
});
