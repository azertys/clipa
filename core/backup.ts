// JSON backup, import merge and backup file names (spec section 9). Pure logic: the database
// code in src/bun/db/backup.ts reads and writes the rows.

export const BACKUP_FORMAT = "clipa-backup";
export const BACKUP_VERSION = 1;
/** Automatic backups kept per kind (spec section 9: "keep the last 14 copies"). */
export const KEEP_BACKUPS = 14;

/** The syncable tables, in the order an import writes them (parents first). */
export const SYNC_TABLE_NAMES = ["tags", "time_entries", "entry_tags", "events", "event_exceptions"] as const;
export type SyncTableName = (typeof SYNC_TABLE_NAMES)[number];
/** The local-only tables that the "include app data" option adds. */
export const APP_TABLE_NAMES = ["apps", "activity"] as const;
export type BackupTableName = SyncTableName | (typeof APP_TABLE_NAMES)[number];

type Kind = "text" | "text?" | "int" | "int?";

const SYNC_FIELDS = { created_at: "int", updated_at: "int", deleted_at: "int?", device_id: "text" } as const;

/** The columns of each table in a backup, with their kinds. Other fields in a file are dropped. */
export const BACKUP_FIELDS: Record<BackupTableName, Record<string, Kind>> = {
	tags: { id: "text", name: "text", color: "text?", ...SYNC_FIELDS },
	time_entries: { id: "text", started_at: "int", ended_at: "int?", note: "text", ...SYNC_FIELDS },
	entry_tags: { entry_id: "text", tag_id: "text", ...SYNC_FIELDS },
	events: {
		id: "text",
		title: "text",
		notes: "text",
		color: "text?",
		starts_at: "int",
		duration_ms: "int",
		all_day: "int",
		tzid: "text",
		rrule: "text?",
		...SYNC_FIELDS,
	},
	event_exceptions: {
		id: "text",
		event_id: "text",
		original_start: "int",
		kind: "text",
		new_starts_at: "int?",
		new_duration_ms: "int?",
		new_title: "text?",
		new_notes: "text?",
		...SYNC_FIELDS,
	},
	apps: { id: "text", platform_key: "text", display_name: "text" },
	activity: { id: "text", entry_id: "text", app_id: "text", window_title: "text?", started_at: "int", ended_at: "int" },
};

export type BackupRow = Record<string, string | number | null>;

export type Backup = {
	format: typeof BACKUP_FORMAT;
	version: typeof BACKUP_VERSION;
	exportedAt: number;
	deviceId: string;
	/** apps and activity are there only when the export included app data. */
	tables: Record<SyncTableName, BackupRow[]> & { apps?: BackupRow[]; activity?: BackupRow[] };
};

export type BackupErrorReason = "invalid" | "version";

export class BackupError extends Error {
	constructor(
		readonly reason: BackupErrorReason,
		detail = "",
	) {
		super(detail ? `${reason}: ${detail}` : reason);
	}
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function fits(value: unknown, kind: Kind): boolean {
	if (value === null || value === undefined) return kind.endsWith("?");
	return kind.startsWith("text") ? typeof value === "string" : Number.isSafeInteger(value);
}

function readRows(table: BackupTableName, value: unknown): BackupRow[] {
	if (!Array.isArray(value)) throw new BackupError("invalid", `${table} is not a list`);
	const fields = Object.entries(BACKUP_FIELDS[table]);
	return value.map((row, i) => {
		if (!isObject(row)) throw new BackupError("invalid", `${table}[${i}] is not an object`);
		const out: BackupRow = {};
		for (const [name, kind] of fields) {
			if (!fits(row[name], kind)) throw new BackupError("invalid", `${table}[${i}].${name}`);
			out[name] = (row[name] ?? null) as string | number | null;
		}
		return out;
	});
}

/** Checks that every reference points to a row in the same file. */
function checkReferences(tables: Backup["tables"]) {
	const ids = (rows: BackupRow[] | undefined) => new Set((rows ?? []).map((r) => r.id));
	const entries = ids(tables.time_entries);
	const tags = ids(tables.tags);
	const events = ids(tables.events);
	const apps = ids(tables.apps);
	const check = (ok: boolean, what: string) => {
		if (!ok) throw new BackupError("invalid", `missing ${what}`);
	};
	for (const r of tables.entry_tags) check(entries.has(r.entry_id) && tags.has(r.tag_id), "entry or tag of entry_tags");
	for (const r of tables.event_exceptions) check(events.has(r.event_id), "event of event_exceptions");
	for (const r of tables.activity ?? []) check(entries.has(r.entry_id) && apps.has(r.app_id), "entry or app of activity");
	for (const r of tables.time_entries) check(r.ended_at === null || (r.ended_at as number) > (r.started_at as number), "end after start");
}

/** Reads a backup file. Throws BackupError when it is not a Clipa backup this version can read. */
export function parseBackup(text: string): Backup {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new BackupError("invalid", "not JSON");
	}
	if (!isObject(data) || data.format !== BACKUP_FORMAT) throw new BackupError("invalid", "not a Clipa backup");
	if (typeof data.version !== "number" || data.version > BACKUP_VERSION) throw new BackupError("version");
	if (data.version !== BACKUP_VERSION) throw new BackupError("invalid", `version ${data.version}`);
	if (!Number.isSafeInteger(data.exportedAt) || typeof data.deviceId !== "string" || !isObject(data.tables)) {
		throw new BackupError("invalid", "header");
	}
	const source = data.tables;
	const tables = {} as Backup["tables"];
	for (const t of SYNC_TABLE_NAMES) tables[t] = readRows(t, source[t]);
	// App data comes as a pair or not at all.
	if (source.apps !== undefined || source.activity !== undefined) {
		tables.apps = readRows("apps", source.apps);
		tables.activity = readRows("activity", source.activity);
	}
	checkReferences(tables);
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: data.exportedAt as number,
		deviceId: data.deviceId,
		tables,
	};
}

export type RowVersion = { updated_at: number; device_id: string };
export type MergeAction = "add" | "update" | "skip";

/**
 * What an import does with one row (spec section 9): the newer updated_at wins; on a tie the
 * larger device_id wins. The same version is the same row, so a second import skips it.
 */
export function mergeAction(local: RowVersion | null, incoming: RowVersion): MergeAction {
	if (!local) return "add";
	if (incoming.updated_at !== local.updated_at) return incoming.updated_at > local.updated_at ? "update" : "skip";
	return incoming.device_id > local.device_id ? "update" : "skip";
}

export type ImportCounts = { added: number; updated: number; skipped: number };

export type ImportSummary = ImportCounts & {
	tables: Record<BackupTableName, ImportCounts>;
	/** Imported tags that have the name of a local tag: their entries use the local tag (open question 6). */
	mergedTags: number;
	/** Imported running entries closed because a local entry runs (open question 7). */
	closedEntries: number;
	/** The copy of the database made before the import. */
	backupPath: string;
};

/** A summary with every count at 0. */
export function emptySummary(backupPath: string): ImportSummary {
	const tables = {} as ImportSummary["tables"];
	for (const t of [...SYNC_TABLE_NAMES, ...APP_TABLE_NAMES]) tables[t] = { added: 0, updated: 0, skipped: 0 };
	return { added: 0, updated: 0, skipped: 0, tables, mergedTags: 0, closedEntries: 0, backupPath };
}

/** Counts one row in the table's counts and in the totals. */
export function countRow(summary: ImportSummary, table: BackupTableName, action: MergeAction): void {
	const key = action === "add" ? "added" : action === "update" ? "updated" : "skipped";
	summary.tables[table][key]++;
	summary[key]++;
}

// File names. Dates are local YYYY-MM-DD, so names sort by time.

/** clipa-backup-2026-10-26.json */
export function backupFileName(date: string): string {
	return `clipa-backup-${date}.json`;
}

export type BackupKind = "daily" | "import";

const PATTERNS: Record<BackupKind, RegExp> = {
	daily: /^clipa-\d{4}-\d{2}-\d{2}\.db$/,
	import: /^clipa-before-import-\d{4}-\d{2}-\d{2}-\d{6}\.db$/,
};

/** clipa-2026-10-26.db for a daily copy. */
export function dailyBackupName(date: string): string {
	return `clipa-${date}.db`;
}

/** clipa-before-import-2026-10-26-153012.db; time is local HHMMSS. */
export function importBackupName(date: string, time: string): string {
	return `clipa-before-import-${date}-${time}.db`;
}

/** The backups of one kind to delete so that the newest `keep` stay. Other files are never listed. */
export function backupsToDelete(names: string[], kind: BackupKind, keep = KEEP_BACKUPS): string[] {
	return names
		.filter((n) => PATTERNS[kind].test(n))
		.sort()
		.reverse()
		.slice(keep);
}

/** The newest daily backup's name, or null. */
export function latestDailyBackup(names: string[]): string | null {
	const daily = names.filter((n) => PATTERNS.daily.test(n)).sort();
	return daily.length ? daily[daily.length - 1] : null;
}
