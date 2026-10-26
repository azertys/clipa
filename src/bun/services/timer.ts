import type { Database } from "bun:sqlite";
import type { EntryWithTags } from "../../../core/types";
import { deleteEntry, getEntry, runningEntry, setEntryTags } from "../db/entries";
import { AppError, writeRow, type WriteContext } from "../db/repo";
import { getSetting, setSetting } from "../db/settings";

export const HEARTBEAT_MS = 30_000;
/** Entries shorter than this are deleted on stop. */
export const MIN_ENTRY_MS = 1_000;
/** With "Discard short entries" on, entries shorter than this are deleted on stop. */
export const SHORT_ENTRY_MS = 60_000;

/** settings key: id of the entry the user chose to keep running when quitting. */
const KEPT_ON_QUIT = "kept_running_entry_id";

export type Recovery =
	| { kind: "none" }
	| { kind: "continued"; entry: EntryWithTags }
	| { kind: "recovered"; entry: EntryWithTags; endedAt: number };

export type TimerOptions = {
	db: Database;
	ctx: WriteContext;
	heartbeatMs?: number;
	/** The shortest entry to keep, read at each stop (the "Discard short entries" setting). */
	minEntryMs?: () => number;
	onChange?: (running: EntryWithTags | null) => void;
};

/**
 * Owns the running entry. The window, the tray and crash recovery all go
 * through this class, so they give the same result.
 */
export class TimerService {
	private heartbeat: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly opts: TimerOptions) {}

	private get db() {
		return this.opts.db;
	}

	private get ctx() {
		return this.opts.ctx;
	}

	status(): EntryWithTags | null {
		return runningEntry(this.db);
	}

	start(input: { note: string; tagIds: string[] }): EntryWithTags {
		const entry = this.db.transaction(() => {
			if (runningEntry(this.db)) throw new AppError("TIMER_RUNNING");
			const now = this.ctx.now();
			const id = Bun.randomUUIDv7();
			writeRow(this.db, this.ctx, "time_entries", { id, started_at: now, ended_at: null, note: input.note });
			setEntryTags(this.db, this.ctx, id, input.tagIds);
			this.writeTimerState(id, now);
			return getEntry(this.db, id)!;
		})();
		this.startHeartbeat();
		this.opts.onChange?.(entry);
		return entry;
	}

	/** Stops the running entry. Returns the closed entry, or null if nothing ran or it was too short. */
	stop(): EntryWithTags | null {
		const closed = this.db.transaction(() => {
			const running = runningEntry(this.db);
			if (!running) return null;
			const now = this.ctx.now();
			const min = Math.max(MIN_ENTRY_MS, this.opts.minEntryMs?.() ?? 0);
			if (now - running.started_at < min) {
				this.removeRunning(running, now);
				return null;
			}
			writeRow(this.db, this.ctx, "time_entries", { ...running, ended_at: now });
			this.writeTimerState(null, null);
			return getEntry(this.db, running.id);
		})();
		this.stopHeartbeat();
		this.opts.onChange?.(null);
		return closed;
	}

	/** Start when stopped, stop when running. */
	toggle(input: { note: string; tagIds: string[] }): EntryWithTags | null {
		if (this.status()) {
			this.stop();
			return null;
		}
		return this.start(input);
	}

	/** Stops the running entry (if any) and starts a new one with the given note and tags. */
	continueWith(input: { note: string; tagIds: string[] }): EntryWithTags {
		if (this.status()) this.stop();
		return this.start(input);
	}

	/** Deletes the running entry and stops the timer (the Today screen's "Discard"). */
	discard(): void {
		const running = this.status();
		if (!running) return;
		this.db.transaction(() => this.removeRunning(running, this.ctx.now()))();
		this.stopHeartbeat();
		this.opts.onChange?.(null);
	}

	/** Deletes an entry. Deleting the running entry also stops the timer. */
	deleteEntry(id: string): void {
		if (this.status()?.id === id) this.discard();
		else deleteEntry(this.db, this.ctx, id);
	}

	/** Called when the user quits with "Quit and keep running". */
	markKeptOnQuit(): void {
		const running = this.status();
		if (running) setSetting(this.db, KEPT_ON_QUIT, running.id);
	}

	/**
	 * Called once at app start. An open entry from a crash ends at the last
	 * heartbeat. An open entry kept on quit continues.
	 */
	recover(): Recovery {
		const running = this.status();
		const kept = getSetting<string | null>(this.db, KEPT_ON_QUIT, null);
		if (kept !== null) setSetting(this.db, KEPT_ON_QUIT, null);
		if (!running) {
			this.writeTimerState(null, null);
			return { kind: "none" };
		}
		if (kept === running.id) {
			this.writeTimerState(running.id, this.ctx.now());
			this.startHeartbeat();
			this.opts.onChange?.(running);
			return { kind: "continued", entry: running };
		}
		const state = this.db.query("SELECT entry_id, heartbeat_at FROM timer_state WHERE id = 1").get() as {
			entry_id: string | null;
			heartbeat_at: number | null;
		} | null;
		const heartbeat = state?.entry_id === running.id ? state.heartbeat_at : null;
		// The heartbeat can equal started_at (a crash in the first 30 s); ended_at must be later.
		const endedAt = Math.max(heartbeat ?? 0, running.started_at + MIN_ENTRY_MS);
		const entry = this.db.transaction(() => {
			writeRow(this.db, this.ctx, "time_entries", { ...running, ended_at: endedAt });
			this.writeTimerState(null, null);
			return getEntry(this.db, running.id)!;
		})();
		return { kind: "recovered", entry, endedAt };
	}

	/** Stops the heartbeat interval. Does not change data. */
	dispose(): void {
		this.stopHeartbeat();
	}

	beat(): void {
		this.db.query("UPDATE timer_state SET heartbeat_at = ? WHERE id = 1 AND entry_id IS NOT NULL").run(this.ctx.now());
	}

	/** Soft-deletes the running entry. ended_at is set so no deleted row stays "running". */
	private removeRunning(running: EntryWithTags, now: number) {
		writeRow(this.db, this.ctx, "time_entries", {
			...running,
			ended_at: Math.max(now, running.started_at + MIN_ENTRY_MS),
			deleted_at: now,
		});
		this.writeTimerState(null, null);
	}

	private writeTimerState(entryId: string | null, heartbeatAt: number | null) {
		this.db
			.query(
				`INSERT INTO timer_state (id, entry_id, heartbeat_at) VALUES (1, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id, heartbeat_at = excluded.heartbeat_at`,
			)
			.run(entryId, heartbeatAt);
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		this.heartbeat = setInterval(() => this.beat(), this.opts.heartbeatMs ?? HEARTBEAT_MS);
	}

	private stopHeartbeat() {
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.heartbeat = null;
	}
}
