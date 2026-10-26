import type { Database } from "bun:sqlite";
import { validateEntry } from "../../../core/entries";
import type { EntryInput, EntryWithTags, TimeEntry } from "../../../core/types";
import { AppError, writeRow, type WriteContext } from "./repo";

// Live tag ids of an entry, as a JSON array. Deleted tags and links do not count.
const TAG_IDS = `(
	SELECT json_group_array(et.tag_id) FROM entry_tags et JOIN tags t ON t.id = et.tag_id
	WHERE et.entry_id = e.id AND et.deleted_at IS NULL AND t.deleted_at IS NULL
) AS tag_ids`;

// Number of apps the sampler recorded for an entry.
const APP_COUNT = `(SELECT COUNT(DISTINCT a.app_id) FROM activity a WHERE a.entry_id = e.id) AS app_count`;

type EntryRow = TimeEntry & { tag_ids: string; app_count?: number };

function withTags(row: EntryRow | null): EntryWithTags | null {
	if (!row) return null;
	const { tag_ids, app_count, ...entry } = row;
	const out: EntryWithTags = { ...entry, tagIds: JSON.parse(tag_ids) as string[] };
	if (app_count !== undefined) out.appCount = app_count;
	return out;
}

export function getEntry(db: Database, id: string): EntryWithTags | null {
	return withTags(db.query(`SELECT e.*, ${TAG_IDS} FROM time_entries e WHERE e.id = ?`).get(id) as EntryRow | null);
}

export function runningEntry(db: Database): EntryWithTags | null {
	return withTags(
		db
			.query(`SELECT e.*, ${TAG_IDS} FROM time_entries e WHERE e.ended_at IS NULL AND e.deleted_at IS NULL`)
			.get() as EntryRow | null,
	);
}

/** Live entries that touch [from, to), newest first. A running entry touches up to now. */
export function listEntries(db: Database, from: number, to: number): EntryWithTags[] {
	const rows = db
		.query(
			`SELECT e.*, ${TAG_IDS}, ${APP_COUNT} FROM time_entries e
			 WHERE e.deleted_at IS NULL AND e.started_at < ? AND (e.ended_at IS NULL OR e.ended_at > ?)
			 ORDER BY e.started_at DESC`,
		)
		.all(to, from) as EntryRow[];
	return rows.map((r) => withTags(r)!);
}

/** The newest live entries, for the tray "Continue" menu. */
export function recentEntries(db: Database, limit: number): EntryWithTags[] {
	const rows = db
		.query(`SELECT e.*, ${TAG_IDS} FROM time_entries e WHERE e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT ?`)
		.all(limit) as EntryRow[];
	return rows.map((r) => withTags(r)!);
}

/** Makes the entry's live tags equal to tagIds. Re-adding a removed tag revives its row. */
export function setEntryTags(db: Database, ctx: WriteContext, entryId: string, tagIds: string[]): void {
	const wanted = new Set(tagIds);
	const rows = db.query("SELECT * FROM entry_tags WHERE entry_id = ?").all(entryId) as {
		tag_id: string;
		deleted_at: number | null;
	}[];
	const have = new Map(rows.map((r) => [r.tag_id, r]));
	for (const tagId of wanted) {
		const row = have.get(tagId);
		if (!row) writeRow(db, ctx, "entry_tags", { entry_id: entryId, tag_id: tagId });
		else if (row.deleted_at !== null) writeRow(db, ctx, "entry_tags", { ...row, deleted_at: null });
	}
	for (const row of rows) {
		if (row.deleted_at === null && !wanted.has(row.tag_id)) {
			writeRow(db, ctx, "entry_tags", { ...row, deleted_at: ctx.now() });
		}
	}
}

/** Creates or updates an entry and its tags in one transaction. */
export function saveEntry(db: Database, ctx: WriteContext, input: EntryInput): EntryWithTags {
	const error = validateEntry(input, ctx.now());
	if (error) throw new AppError(error === "end-before-start" ? "ENTRY_END_BEFORE_START" : "ENTRY_START_IN_FUTURE");
	return db.transaction(() => {
		const existing = input.id ? getEntry(db, input.id) : null;
		if (input.id && (!existing || existing.deleted_at !== null)) throw new AppError("ENTRY_NOT_FOUND");
		// Only the timer service opens and closes the running entry.
		const isRunning = existing !== null && existing.ended_at === null;
		if (!isRunning && input.ended_at === null) throw new AppError("ENTRY_END_REQUIRED");
		if (isRunning && input.ended_at !== null) throw new AppError("ENTRY_IS_RUNNING");
		const id = existing?.id ?? Bun.randomUUIDv7();
		writeRow(db, ctx, "time_entries", {
			...(existing ?? {}),
			id,
			started_at: input.started_at,
			ended_at: input.ended_at,
			note: input.note,
		});
		setEntryTags(db, ctx, id, input.tagIds);
		return getEntry(db, id)!;
	})();
}

/** Soft-deletes an entry. */
export function deleteEntry(db: Database, ctx: WriteContext, id: string): void {
	const existing = getEntry(db, id);
	if (!existing || existing.deleted_at !== null) return;
	writeRow(db, ctx, "time_entries", { ...existing, deleted_at: ctx.now() });
}
