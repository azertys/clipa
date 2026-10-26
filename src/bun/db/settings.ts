import type { Database } from "bun:sqlite";
import type { WeekStart } from "../../../core/time";
import type { ActivityDays, Settings } from "../../shared/rpc-schema";

export const DEFAULT_IDLE_MINUTES = 5;
const ACTIVITY_DAYS: ActivityDays[] = [30, 90, 365, 0];
const strings = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

// Local key-value settings. Values are JSON.

export function getSetting<T>(db: Database, key: string, fallback: T): T {
	const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
	return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(db: Database, key: string, value: unknown): void {
	forgetSettings(db);
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

// The sampler and idle monitor read the settings every second: keep them in memory.
const cache = new WeakMap<Database, Settings>();

/** Drops the cached settings. setSetting and tag deletes call it. */
export function forgetSettings(db: Database): void {
	cache.delete(db);
}

/** App settings with defaults. Default tags that were deleted are dropped. Do not change the result. */
export function readSettings(db: Database): Settings {
	const cached = cache.get(db);
	if (cached) return cached;
	const live = new Set(
		(db.query("SELECT id FROM tags WHERE deleted_at IS NULL").all() as { id: string }[]).map((r) => r.id),
	);
	const settings = {
		defaultTagIds: getSetting<string[]>(db, "default_tag_ids", []).filter((id) => live.has(id)),
		showTrackedTime: getSetting(db, "show_tracked_time", true),
		showTrayTimer: getSetting(db, "show_tray_timer", true),
		weekStart: getSetting<WeekStart>(db, "week_start", 1) === 7 ? 7 : 1,
		hour12: getSetting(db, "hour12", false),
		discardShort: getSetting(db, "discard_short", false),
		idleMinutes: getSetting(db, "idle_minutes", DEFAULT_IDLE_MINUTES),
		recordTitles: getSetting(db, "record_titles", false),
		noTitleApps: strings(getSetting(db, "no_title_apps", [])),
		excludedApps: strings(getSetting(db, "excluded_apps", [])),
		activityDays: getSetting<ActivityDays>(db, "activity_days", 90),
	} satisfies Settings;
	cache.set(db, settings);
	return settings;
}

export function writeSettings(db: Database, patch: Partial<Settings>): Settings {
	if (patch.defaultTagIds !== undefined) setSetting(db, "default_tag_ids", patch.defaultTagIds);
	if (patch.showTrackedTime !== undefined) setSetting(db, "show_tracked_time", patch.showTrackedTime);
	if (patch.showTrayTimer !== undefined) setSetting(db, "show_tray_timer", patch.showTrayTimer);
	if (patch.weekStart !== undefined) setSetting(db, "week_start", patch.weekStart === 7 ? 7 : 1);
	if (patch.hour12 !== undefined) setSetting(db, "hour12", patch.hour12);
	if (patch.discardShort !== undefined) setSetting(db, "discard_short", patch.discardShort);
	if (patch.idleMinutes !== undefined) {
		setSetting(db, "idle_minutes", Math.min(60, Math.max(0, Math.round(patch.idleMinutes))));
	}
	if (patch.recordTitles !== undefined) setSetting(db, "record_titles", patch.recordTitles);
	if (patch.noTitleApps !== undefined) setSetting(db, "no_title_apps", strings(patch.noTitleApps));
	if (patch.excludedApps !== undefined) setSetting(db, "excluded_apps", strings(patch.excludedApps));
	if (patch.activityDays !== undefined && ACTIVITY_DAYS.includes(patch.activityDays)) {
		setSetting(db, "activity_days", patch.activityDays);
	}
	return readSettings(db);
}
