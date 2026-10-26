import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, migrate, openDatabase, userVersion } from "./database";
import { deviceId, getSetting, setSetting } from "./settings";

describe("migrations", () => {
	test("run from an empty database to the latest user_version", () => {
		const db = new Database(":memory:", { strict: true });
		expect(userVersion(db)).toBe(0);
		expect(migrate(db)).toBe(MIGRATIONS.length);
		const tables = (db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
			name: string;
		}[]).map((r) => r.name);
		expect(tables).toEqual([
			"activity",
			"apps",
			"entry_tags",
			"event_exceptions",
			"events",
			"idle_periods",
			"settings",
			"tags",
			"time_entries",
			"timer_state",
		]);
		// A second run changes nothing.
		expect(migrate(db)).toBe(MIGRATIONS.length);
	});

	test("a failing migration rolls back and keeps the old version", () => {
		const db = new Database(":memory:", { strict: true });
		const bad = [...MIGRATIONS, { name: "002_bad", sql: "CREATE TABLE x (a); SELECT nope FROM missing;" }];
		migrate(db);
		expect(() => migrate(db, bad)).toThrow();
		expect(userVersion(db)).toBe(MIGRATIONS.length);
		expect(db.query("SELECT name FROM sqlite_master WHERE name = 'x'").get()).toBeNull();
	});

	test("refuses a database from a newer app", () => {
		const db = new Database(":memory:", { strict: true });
		db.exec("PRAGMA user_version = 99");
		expect(() => migrate(db)).toThrow(/newer/);
	});
});

describe("database file", () => {
	test("WAL mode, foreign keys, and data survive a reopen", () => {
		const dir = mkdtempSync(join(tmpdir(), "clipa-db-"));
		try {
			const path = join(dir, "clipa.db");
			const db = openDatabase(path);
			expect((db.query("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
			expect((db.query("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
			const id = deviceId(db);
			setSetting(db, "launch_count", 1);
			db.close();

			const again = openDatabase(path);
			expect(deviceId(again)).toBe(id);
			expect(getSetting(again, "launch_count", 0)).toBe(1);
			again.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("schema rules", () => {
	const fresh = () => {
		const db = new Database(":memory:", { strict: true });
		db.exec("PRAGMA foreign_keys = ON");
		migrate(db);
		return db;
	};
	const insertEntry = (db: Database, id: string, started: number, ended: number | null, deleted: number | null = null) =>
		db
			.query(
				`INSERT INTO time_entries (id, started_at, ended_at, created_at, updated_at, deleted_at, device_id)
				 VALUES (?, ?, ?, 0, 0, ?, 'd')`,
			)
			.run(id, started, ended, deleted);

	test("only one running entry", () => {
		const db = fresh();
		insertEntry(db, "a", 1, null);
		expect(() => insertEntry(db, "b", 2, null)).toThrow(/UNIQUE/);
		// A soft-deleted running entry does not count.
		insertEntry(db, "c", 3, null, 5);
		insertEntry(db, "d", 4, 10);
	});

	test("ended_at must be after started_at", () => {
		const db = fresh();
		expect(() => insertEntry(db, "a", 10, 10)).toThrow(/CHECK/);
	});

	test("tag names are unique, case-insensitive, among live tags", () => {
		const db = fresh();
		const insertTag = (id: string, name: string, deleted: number | null = null) =>
			db
				.query(
					"INSERT INTO tags (id, name, created_at, updated_at, deleted_at, device_id) VALUES (?, ?, 0, 0, ?, 'd')",
				)
				.run(id, name, deleted);
		insertTag("a", "Work");
		expect(() => insertTag("b", "work")).toThrow(/UNIQUE/);
		insertTag("c", "Old", 1);
		insertTag("d", "old");
	});
});
