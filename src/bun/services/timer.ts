import type { Database } from "bun:sqlite";
import { planIdleDiscard } from "../../../core/activity";
import type { EntryWithTags } from "../../../core/types";
import { activityOfEntry, deleteActivity, getIdle, resolveIdle, writeActivity } from "../db/activity";
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

	/**
	 * "Discard" (stop = false) or "Discard and stop" (stop = true) for an ended idle period.
	 * Splits or ends the entry, moves or deletes its activity, and resolves the period, in one
	 * transaction. A running entry keeps running as the new entry after the idle time.
	 */
	discardIdle(periodId: string, stop: boolean): void {
		const period = getIdle(this.db, periodId);
		if (!period || period.resolution !== "pending" || period.ended_at === null) throw new AppError("IDLE_NOT_PENDING");
		const entry = getEntry(this.db, period.entry_id);
		const wasRunning = entry !== null && entry.deleted_at === null && entry.ended_at === null;
		let running: EntryWithTags | null = null;
		this.db.transaction(() => {
			resolveIdle(this.db, period.id, "discarded");
			if (!entry || entry.deleted_at !== null) return;
			const plan = planIdleDiscard({
				entry,
				idle: { start: period.started_at, end: period.ended_at! },
				activity: activityOfEntry(this.db, entry.id),
				stop,
				newId: () => Bun.randomUUIDv7(),
			});
			if (!plan) {
				if (stop && wasRunning) this.removeOrClose(entry, this.ctx.now());
				return;
			}
			const now = this.ctx.now();
			// The first part closes before the second opens: one_running allows one open entry.
			writeRow(this.db, this.ctx, "time_entries", {
				...entry,
				ended_at: plan.first.ended_at,
				deleted_at: plan.first.deleted ? now : null,
			});
			let secondId: string | null = null;
			if (plan.second) {
				secondId = Bun.randomUUIDv7();
				writeRow(this.db, this.ctx, "time_entries", {
					id: secondId,
					started_at: plan.second.started_at,
					ended_at: plan.second.ended_at,
					note: entry.note,
				});
				setEntryTags(this.db, this.ctx, secondId, entry.tagIds);
			}
			deleteActivity(this.db, plan.deletes);
			for (const row of plan.upserts) writeActivity(this.db, { ...row, entry_id: row.entry_id || secondId! });
			if (wasRunning) {
				running = secondId && plan.second?.ended_at === null ? getEntry(this.db, secondId) : null;
				this.writeTimerState(running?.id ?? null, running ? now : null);
			}
		})();
		if (!wasRunning) return;
		if (running) this.startHeartbeat();
		else this.stopHeartbeat();
		this.opts.onChange?.(running);
	}

	/** Called when the user quits with "Quit and keep running". */
	markKeptOnQuit(): void {
		const running = this.status();
		if (running) setSetting(this.db, KEPT_ON_QUIT, running.id);
	}

	/** The quit did not happen (a failed update restart): a later crash is a crash again. */
	clearKeptOnQuit(): void {
		setSetting(this.db, KEPT_ON_QUIT, null);
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

	/** After an import: follow the running entry in the database (heartbeat, sampler, view). */
	resync(): void {
		const running = this.status();
		this.writeTimerState(running?.id ?? null, running ? this.ctx.now() : null);
		if (running) this.startHeartbeat();
		else this.stopHeartbeat();
		this.opts.onChange?.(running);
	}

	/** Stops the heartbeat interval. Does not change data. */
	dispose(): void {
		this.stopHeartbeat();
	}

	beat(): void {
		this.db.query("UPDATE timer_state SET heartbeat_at = ? WHERE id = 1 AND entry_id IS NOT NULL").run(this.ctx.now());
	}

	/** Ends a running entry at `at`, or deletes it when that leaves less than 1 s. */
	private removeOrClose(entry: EntryWithTags, at: number) {
		if (at - entry.started_at < MIN_ENTRY_MS) this.removeRunning(entry, at);
		else writeRow(this.db, this.ctx, "time_entries", { ...entry, ended_at: at });
		this.writeTimerState(null, null);
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
