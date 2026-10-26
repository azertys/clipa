import { Database } from "bun:sqlite";
import m001 from "./migrations/001_init.sql" with { type: "text" };
import m002 from "./migrations/002_activity_range.sql" with { type: "text" };

// Ordered list. The index + 1 is the PRAGMA user_version after the migration.
// Add new files as NNN_name.sql and append them here.
export const MIGRATIONS: { name: string; sql: string }[] = [
	{ name: "001_init", sql: m001 },
	{ name: "002_activity_range", sql: m002 },
];

export function openDatabase(path: string): Database {
	const db = new Database(path, { create: true, strict: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA busy_timeout = 5000");
	migrate(db);
	return db;
}

export function userVersion(db: Database): number {
	return (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

/** Runs all pending migrations in one transaction. */
export function migrate(db: Database, migrations = MIGRATIONS): number {
	const current = userVersion(db);
	if (current > migrations.length) {
		throw new Error(
			`Database version ${current} is newer than this app (${migrations.length}). Update Clipa.`,
		);
	}
	const pending = migrations.slice(current);
	if (pending.length === 0) return current;
	db.transaction(() => {
		pending.forEach((m, i) => {
			db.exec(m.sql);
			db.exec(`PRAGMA user_version = ${current + i + 1}`);
		});
	})();
	return userVersion(db);
}
