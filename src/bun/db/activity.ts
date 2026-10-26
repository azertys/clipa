import type { Database } from "bun:sqlite";
import type { ActivityRow, Segment } from "../../../core/activity";
import type { AppTime } from "../../../core/reports";

// Local-only tables: apps, activity and idle_periods. They are not synced (spec section 4).

export type App = { id: string; platform_key: string; display_name: string };

/** The app row for a platform key (bundle id). New keys are added; a changed name is updated. */
export function appFor(db: Database, key: string, name: string): App {
	const existing = db.query("SELECT * FROM apps WHERE platform_key = ?").get(key) as App | null;
	if (existing && existing.display_name === name) return existing;
	if (existing) {
		db.query("UPDATE apps SET display_name = ? WHERE id = ?").run(name, existing.id);
		return { ...existing, display_name: name };
	}
	const app = { id: Bun.randomUUIDv7(), platform_key: key, display_name: name };
	db.query("INSERT INTO apps (id, platform_key, display_name) VALUES ($id, $platform_key, $display_name)").run(app);
	return app;
}

export function listAppsByName(db: Database): App[] {
	return db.query("SELECT * FROM apps ORDER BY display_name COLLATE NOCASE").all() as App[];
}

/** Inserts or updates one activity row by id. */
export function writeActivity(db: Database, row: ActivityRow): void {
	db.query(
		`INSERT INTO activity (id, entry_id, app_id, window_title, started_at, ended_at)
		 VALUES ($id, $entry_id, $app_id, $window_title, $started_at, $ended_at)
		 ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id, app_id = excluded.app_id,
		 window_title = excluded.window_title, started_at = excluded.started_at, ended_at = excluded.ended_at`,
	).run(row);
}

/** Writes a sampler segment as an activity row of the entry. */
export function writeSegment(db: Database, entryId: string, appId: string, segment: Segment): void {
	writeActivity(db, {
		id: segment.id,
		entry_id: entryId,
		app_id: appId,
		window_title: segment.title,
		started_at: segment.start,
		ended_at: segment.end,
	});
}

export function activityOfEntry(db: Database, entryId: string): ActivityRow[] {
	return db.query("SELECT * FROM activity WHERE entry_id = ? ORDER BY started_at").all(entryId) as ActivityRow[];
}

export function deleteActivity(db: Database, ids: string[]): void {
	const stmt = db.query("DELETE FROM activity WHERE id = ?");
	for (const id of ids) stmt.run(id);
}

/** Time per app for one entry, longest first. */
export function appTimesOfEntry(db: Database, entryId: string): (AppTime & { name: string })[] {
	return db
		.query(
			`SELECT a.app_id AS appId, p.display_name AS name, SUM(a.ended_at - a.started_at) AS ms
			 FROM activity a JOIN apps p ON p.id = a.app_id
			 WHERE a.entry_id = ? GROUP BY a.app_id ORDER BY ms DESC`,
		)
		.all(entryId) as (AppTime & { name: string })[];
}

/** Deletes activity that ended before `before`. Returns the number of rows. */
export function purgeActivity(db: Database, before: number): number {
	return db.query("DELETE FROM activity WHERE ended_at < ?").run(before).changes;
}

// --- Idle periods ------------------------------------------------------------

export type IdlePeriod = {
	id: string;
	entry_id: string;
	started_at: number;
	ended_at: number | null;
	resolution: "pending" | "kept" | "discarded";
};

export function insertIdle(db: Database, period: Omit<IdlePeriod, "resolution">): IdlePeriod {
	const row: IdlePeriod = { ...period, resolution: "pending" };
	db.query(
		`INSERT INTO idle_periods (id, entry_id, started_at, ended_at, resolution)
		 VALUES ($id, $entry_id, $started_at, $ended_at, $resolution)`,
	).run(row);
	return row;
}

export function getIdle(db: Database, id: string): IdlePeriod | null {
	return db.query("SELECT * FROM idle_periods WHERE id = ?").get(id) as IdlePeriod | null;
}

export function setIdleEnd(db: Database, id: string, endedAt: number): void {
	db.query("UPDATE idle_periods SET ended_at = ? WHERE id = ?").run(endedAt, id);
}

export function resolveIdle(db: Database, id: string, resolution: "kept" | "discarded"): void {
	db.query("UPDATE idle_periods SET resolution = ? WHERE id = ?").run(resolution, id);
}

export function pendingIdle(db: Database): IdlePeriod[] {
	return db.query("SELECT * FROM idle_periods WHERE resolution = 'pending' ORDER BY started_at").all() as IdlePeriod[];
}
