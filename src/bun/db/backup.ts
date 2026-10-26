import type { Database } from "bun:sqlite";
import {
	BACKUP_FIELDS,
	BACKUP_FORMAT,
	BACKUP_VERSION,
	BackupError,
	countRow,
	emptySummary,
	mergeAction,
	parseBackup,
	SYNC_TABLE_NAMES,
	type Backup,
	type BackupRow,
	type ImportSummary,
	type RowVersion,
	type SyncTableName,
} from "../../../core/backup";
import { MIN_ENTRY_MS } from "../services/timer";
import { AppError, SYNC_TABLES, writeRow, type WriteContext } from "./repo";

// Export and import of the JSON backup (spec section 9). Writes go through writeRow (D13).

const columns = (table: keyof typeof BACKUP_FIELDS) => Object.keys(BACKUP_FIELDS[table]);

function allRows(db: Database, table: keyof typeof BACKUP_FIELDS, orderBy: string): BackupRow[] {
	return db.query(`SELECT ${columns(table).join(", ")} FROM ${table} ORDER BY ${orderBy}`).all() as BackupRow[];
}

/** Every row of the syncable tables, deleted rows too. App data only when asked. */
export function exportBackup(db: Database, ctx: WriteContext, includeAppData: boolean): Backup {
	const tables = {} as Backup["tables"];
	for (const t of SYNC_TABLE_NAMES) tables[t] = allRows(db, t, SYNC_TABLES[t].key.join(", "));
	if (includeAppData) {
		tables.apps = allRows(db, "apps", "id");
		tables.activity = allRows(db, "activity", "id");
	}
	return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: ctx.now(), deviceId: ctx.deviceId, tables };
}

/** A consistent copy of the database file (spec section 9: VACUUM INTO). The file must not exist. */
export function copyDatabase(db: Database, path: string): void {
	db.query("VACUUM INTO ?").run(path);
}

export const BACKUP_ERROR_CODES = { invalid: "BACKUP_INVALID", version: "BACKUP_VERSION" } as const;

function versionOf(db: Database, table: SyncTableName, row: BackupRow): RowVersion | null {
	const key = SYNC_TABLES[table].key;
	return db
		.query(`SELECT updated_at, device_id FROM ${table} WHERE ${key.map((k) => `${k} = $${k}`).join(" AND ")}`)
		.get(Object.fromEntries(key.map((k) => [k, row[k]])) as never) as RowVersion | null;
}

const asVersion = (row: BackupRow): RowVersion => ({
	updated_at: row.updated_at as number,
	device_id: row.device_id as string,
});

/**
 * Merges a backup into the database in one transaction (spec section 9). Each row is added,
 * updated or skipped by mergeAction. The rows keep their updated_at and device_id, so a second
 * import of the same file changes nothing. Three conflicts with local rows are resolved here:
 * a tag name in use (open question 6), a second running entry (open question 7) and a second
 * live exception for one occurrence.
 */
export function importBackup(db: Database, ctx: WriteContext, backup: Backup, backupPath: string): ImportSummary {
	const summary = emptySummary(backupPath);
	const t = backup.tables;
	db.transaction(() => {
		// Imported tag id → local tag id, for tags merged by name.
		const tagIds = new Map<string, string>();
		for (const row of t.tags) {
			const action = mergeAction(versionOf(db, "tags", row), asVersion(row));
			if (action !== "skip" && row.deleted_at === null) {
				const same = db
					.query("SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id <> ?")
					.get(row.name, row.id) as { id: string } | null;
				if (same) {
					tagIds.set(row.id as string, same.id);
					summary.mergedTags++;
					countRow(summary, "tags", "skip");
					continue;
				}
			}
			apply("tags", row, action);
		}

		// Running entries last, so that one already closed by this import does not count.
		const running = (r: BackupRow) => r.ended_at === null && r.deleted_at === null;
		for (const row of [...t.time_entries.filter((r) => !running(r)), ...t.time_entries.filter(running)]) {
			const action = mergeAction(versionOf(db, "time_entries", row), asVersion(row));
			if (action !== "skip" && running(row)) {
				const other = db
					.query("SELECT id FROM time_entries WHERE ended_at IS NULL AND deleted_at IS NULL AND id <> ?")
					.get(row.id);
				if (other) {
					// A local change. Its version must be newer than the imported one, whatever the
					// clocks say, so that the next import of the same file skips the row.
					const updatedAt = row.updated_at as number;
					writeRow(
						db,
						ctx,
						"time_entries",
						{
							...row,
							ended_at: Math.max(updatedAt, (row.started_at as number) + MIN_ENTRY_MS),
							updated_at: Math.max(ctx.now(), updatedAt + 1),
							device_id: ctx.deviceId,
						},
						false,
					);
					summary.closedEntries++;
					countRow(summary, "time_entries", action);
					continue;
				}
			}
			apply("time_entries", row, action);
		}

		for (const row of t.entry_tags) {
			const mapped = { ...row, tag_id: tagIds.get(row.tag_id as string) ?? row.tag_id };
			apply("entry_tags", mapped, mergeAction(versionOf(db, "entry_tags", mapped), asVersion(mapped)));
		}

		for (const row of t.events) apply("events", row, mergeAction(versionOf(db, "events", row), asVersion(row)));

		for (const row of t.event_exceptions) {
			const action = mergeAction(versionOf(db, "event_exceptions", row), asVersion(row));
			if (action !== "skip" && row.deleted_at === null) {
				const other = db
					.query(
						`SELECT ${columns("event_exceptions").join(", ")} FROM event_exceptions
						 WHERE event_id = ? AND original_start = ? AND deleted_at IS NULL AND id <> ?`,
					)
					.get(row.event_id, row.original_start, row.id) as BackupRow | null;
				if (other) {
					// One live exception per occurrence: the newer one stays.
					if (mergeAction(asVersion(other), asVersion(row)) === "skip") {
						countRow(summary, "event_exceptions", "skip");
						continue;
					}
					writeRow(db, ctx, "event_exceptions", { ...other, deleted_at: ctx.now() });
				}
			}
			apply("event_exceptions", row, action);
		}

		if (t.apps && t.activity) importAppData(db, t.apps, t.activity, summary);
	})();
	return summary;

	function apply(table: SyncTableName, row: BackupRow, action: ReturnType<typeof mergeAction>) {
		if (action !== "skip") writeRow(db, ctx, table, row, false);
		countRow(summary, table, action);
	}
}

/** Apps match by bundle id. Activity rows are added when their id is new; they never change. */
function importAppData(db: Database, apps: BackupRow[], activity: BackupRow[], summary: ImportSummary) {
	const appIds = new Map<string, string>();
	for (const app of apps) {
		const local = db.query("SELECT id FROM apps WHERE platform_key = ?").get(app.platform_key) as { id: string } | null;
		if (local) {
			appIds.set(app.id as string, local.id);
			countRow(summary, "apps", "skip");
			continue;
		}
		const idTaken = db.query("SELECT 1 FROM apps WHERE id = ?").get(app.id) !== null;
		const id = idTaken ? Bun.randomUUIDv7() : (app.id as string);
		db.query("INSERT INTO apps (id, platform_key, display_name) VALUES (?, ?, ?)").run(id, app.platform_key, app.display_name);
		appIds.set(app.id as string, id);
		countRow(summary, "apps", "add");
	}
	const insert = db.query(
		`INSERT INTO activity (id, entry_id, app_id, window_title, started_at, ended_at)
		 VALUES ($id, $entry_id, $app_id, $window_title, $started_at, $ended_at) ON CONFLICT(id) DO NOTHING`,
	);
	for (const row of activity) {
		const result = insert.run({ ...row, app_id: appIds.get(row.app_id as string) ?? row.app_id } as never);
		countRow(summary, "activity", result.changes > 0 ? "add" : "skip");
	}
}

/** Reads a backup file's text. A file this version cannot read gives BACKUP_INVALID or BACKUP_VERSION. */
export function parseBackupFile(text: string): Backup {
	try {
		return parseBackup(text);
	} catch (e) {
		if (!(e instanceof BackupError)) throw e;
		console.warn("[clipa] backup file refused:", e.message);
		throw new AppError(BACKUP_ERROR_CODES[e.reason]);
	}
}
