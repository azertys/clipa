import type { Database } from "bun:sqlite";
import type { Settings } from "../../shared/rpc-schema";

// Local key-value settings. Values are JSON.

export function getSetting<T>(db: Database, key: string, fallback: T): T {
	const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
	return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(db: Database, key: string, value: unknown): void {
	db.query(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
	).run(key, JSON.stringify(value));
}

/** The id of this device. Created at first start and kept in settings. */
export function deviceId(db: Database): string {
	const existing = getSetting<string | null>(db, "device_id", null);
	if (existing) return existing;
	const id = Bun.randomUUIDv7();
	setSetting(db, "device_id", id);
	return id;
}

/** App settings with defaults. Default tags that were deleted are dropped. */
export function readSettings(db: Database): Settings {
	const live = new Set(
		(db.query("SELECT id FROM tags WHERE deleted_at IS NULL").all() as { id: string }[]).map((r) => r.id),
	);
	return {
		defaultTagIds: getSetting<string[]>(db, "default_tag_ids", []).filter((id) => live.has(id)),
	};
}

export function writeSettings(db: Database, patch: Partial<Settings>): Settings {
	if (patch.defaultTagIds !== undefined) setSetting(db, "default_tag_ids", patch.defaultTagIds);
	return readSettings(db);
}
