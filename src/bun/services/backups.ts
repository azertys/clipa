import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { backupsToDelete, dailyBackupName, importBackupName, latestDailyBackup, type BackupKind } from "../../../core/backup";
import { localDate } from "../../../core/time";
import type { Settings } from "../../shared/rpc-schema";
import { copyDatabase } from "../db/backup";

/** How often a long-running app checks whether today's copy exists. */
export const DAILY_CHECK_MS = 60 * 60_000;

export type BackupStatus = { folder: string; lastAt: number | null };

export type BackupsOptions = {
	db: Database;
	now: () => number;
	tzid: () => string;
	settings: () => Settings;
	/** The folder used when the user has not chosen one: <userData>/backups. */
	defaultFolder: string;
};

/**
 * Copies of the database file (spec section 9): one a day while automatic backup is on, and one
 * before every import. Each kind keeps its newest 14 files; other files in the folder are left alone.
 */
export class Backups {
	constructor(private readonly opts: BackupsOptions) {}

	folder(): string {
		return this.opts.settings().backupFolder ?? this.opts.defaultFolder;
	}

	/** Makes today's copy if automatic backup is on and it is missing. Returns its path, or null. */
	daily(): string | null {
		if (!this.opts.settings().autoBackup) return null;
		const path = join(this.ensureFolder(), dailyBackupName(localDate(this.opts.now(), this.opts.tzid())));
		if (existsSync(path)) return null;
		copyDatabase(this.opts.db, path);
		this.prune("daily");
		return path;
	}

	/** The copy made before an import. Always made, whatever the automatic backup setting. */
	beforeImport(): string {
		const now = this.opts.now();
		const tz = this.opts.tzid();
		const time = new Date(now).toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }).replaceAll(":", "");
		const path = join(this.ensureFolder(), importBackupName(localDate(now, tz), time));
		copyDatabase(this.opts.db, path);
		this.prune("import");
		return path;
	}

	status(): BackupStatus {
		const folder = this.folder();
		const latest = existsSync(folder) ? latestDailyBackup(readdirSync(folder)) : null;
		return { folder, lastAt: latest ? statSync(join(folder, latest)).mtimeMs : null };
	}

	private ensureFolder(): string {
		const folder = this.folder();
		mkdirSync(folder, { recursive: true });
		return folder;
	}

	private prune(kind: BackupKind) {
		const folder = this.folder();
		for (const name of backupsToDelete(readdirSync(folder), kind)) rmSync(join(folder, name), { force: true });
	}
}
