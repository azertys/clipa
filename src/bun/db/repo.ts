import type { Database } from "bun:sqlite";

// Every write to a syncable table goes through writeRow(). v2 sync hooks in here.

export type WriteContext = { deviceId: string; now: () => number };

/** An error the view can show. The message is the code; src/mainview/strings.ts has the text. */
export class AppError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export const SYNC_TABLES = {
	tags: { key: ["id"], columns: ["id", "name", "color"] },
	time_entries: { key: ["id"], columns: ["id", "started_at", "ended_at", "note"] },
	entry_tags: { key: ["entry_id", "tag_id"], columns: ["entry_id", "tag_id"] },
	events: {
		key: ["id"],
		columns: ["id", "title", "notes", "color", "starts_at", "duration_ms", "all_day", "tzid", "rrule"],
	},
	event_exceptions: {
		key: ["id"],
		columns: [
			"id",
			"event_id",
			"original_start",
			"kind",
			"new_starts_at",
			"new_duration_ms",
			"new_title",
			"new_notes",
		],
	},
} as const;

export type SyncTable = keyof typeof SYNC_TABLES;

const SYNC_COLUMNS = ["created_at", "updated_at", "deleted_at", "device_id"] as const;

type Row = Record<string, unknown>;

/**
 * Inserts or updates one row of a syncable table.
 * stamp = true (normal writes): updated_at = now, device_id = this device, created_at kept.
 * stamp = false (import): the row is written as given.
 */
export function writeRow<T extends Row>(
	db: Database,
	ctx: WriteContext,
	table: SyncTable,
	row: Row,
	stamp = true,
): T {
	const spec = SYNC_TABLES[table];
	const now = ctx.now();
	const full: Row = { ...row };
	if (stamp) {
		full.updated_at = now;
		full.device_id = ctx.deviceId;
		full.created_at ??= now;
		full.deleted_at ??= null;
	}
	const columns = [...spec.columns, ...SYNC_COLUMNS];
	for (const c of columns) {
		if (!(c in full)) throw new Error(`writeRow(${table}): missing ${c}`);
	}
	const updates = columns.filter((c) => !(spec.key as readonly string[]).includes(c) && c !== "created_at");
	const sql =
		`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => `$${c}`).join(", ")}) ` +
		`ON CONFLICT(${spec.key.join(", ")}) DO UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}`;
	const params: Record<string, unknown> = {};
	for (const c of columns) params[c] = full[c];
	db.query(sql).run(params as never);
	const result: Row = {};
	for (const c of columns) result[c] = full[c];
	return result as T;
}
