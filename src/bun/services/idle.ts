import type { Database } from "bun:sqlite";
import type { EntryWithTags, Interval } from "../../../core/types";
import type { IdlePrompt, Settings } from "../../shared/rpc-schema";
import { insertIdle, pendingIdle, resolveIdle, setIdleEnd, type IdlePeriod } from "../db/activity";
import type { NativeTracker } from "../native/tracker";

export const IDLE_POLL_MS = 5_000;
/** Input within this time means the user is back. */
const RESUME_MS = 5_000;
const MINUTE = 60_000;

export type IdleOptions = {
	db: Database;
	tracker: NativeTracker;
	now: () => number;
	settings: () => Settings;
	running: () => EntryWithTags | null;
	/** An idle period ended: ask the user Keep / Discard / Discard and stop. */
	onPrompt: (prompt: IdlePrompt) => void;
	newId?: () => string;
	/** Tests poll by hand with 0. */
	pollMs?: number;
};

const toPrompt = (p: IdlePeriod): IdlePrompt => ({ id: p.id, entryId: p.entry_id, start: p.started_at, end: p.ended_at! });

/**
 * Watches for idle time while the timer runs (spec section 5). Past the threshold it records a
 * pending idle period; when input starts again it ends the period and asks the user. A sleep gap
 * from the sampler is idle time too. One question at a time.
 */
export class IdleMonitor {
	private interval: ReturnType<typeof setInterval> | null = null;
	/** Idle now: the period has a start and no end yet. */
	private open: IdlePeriod | null = null;
	/** Ended and waiting for the user's answer. */
	private asking: IdlePeriod | null = null;

	constructor(private readonly opts: IdleOptions) {}

	start(): void {
		const pollMs = this.opts.pollMs ?? IDLE_POLL_MS;
		if (this.interval || pollMs <= 0) return;
		this.interval = setInterval(() => this.poll(), pollMs);
	}

	/** The timer stopped. An open period ends now and is asked about. */
	stop(): void {
		if (this.interval) clearInterval(this.interval);
		this.interval = null;
		if (this.open) this.finish(this.open, this.opts.now());
	}

	poll(): void {
		const entry = this.opts.running();
		if (!entry) return;
		const now = this.opts.now();
		const idleMs = Math.max(0, this.opts.tracker.idleSeconds() * 1000);
		if (this.open) {
			if (idleMs < RESUME_MS) this.finish(this.open, now - idleMs);
			return;
		}
		const minutes = this.opts.settings().idleMinutes;
		if (this.asking || minutes <= 0 || idleMs < minutes * MINUTE) return;
		this.open = insertIdle(this.opts.db, {
			id: this.newId(),
			entry_id: entry.id,
			started_at: Math.max(entry.started_at, now - idleMs),
			ended_at: null,
		});
	}

	/** The system slept during [gap.start, gap.end). Asked about whatever the idle setting. */
	sleep(gap: Interval): void {
		const entry = this.opts.running();
		// An open idle period already covers the sleep; it ends when input starts again.
		if (!entry || this.open || this.asking) return;
		const period = insertIdle(this.opts.db, {
			id: this.newId(),
			entry_id: entry.id,
			started_at: Math.max(entry.started_at, gap.start),
			ended_at: gap.end,
		});
		this.asking = period;
		this.opts.onPrompt(toPrompt(period));
	}

	/** The question waiting for an answer, for a window that opens later. */
	question(): IdlePrompt | null {
		return this.asking ? toPrompt(this.asking) : null;
	}

	/** The user answered; a new idle period can start. */
	answered(id: string): void {
		if (this.asking?.id === id) this.asking = null;
	}

	/**
	 * At app start: periods left pending by a crash or quit are kept (no tracked time is removed
	 * without the user's answer). Returns their number.
	 */
	static keepLeftovers(db: Database, now: number): number {
		const left = pendingIdle(db);
		for (const p of left) {
			if (p.ended_at === null) setIdleEnd(db, p.id, Math.max(p.started_at, now));
			resolveIdle(db, p.id, "kept");
		}
		return left.length;
	}

	private finish(period: IdlePeriod, end: number) {
		const ended = { ...period, ended_at: Math.max(period.started_at, end) };
		setIdleEnd(this.opts.db, ended.id, ended.ended_at);
		this.open = null;
		if (ended.ended_at - ended.started_at <= 0) {
			resolveIdle(this.opts.db, ended.id, "kept");
			return;
		}
		this.asking = ended;
		this.opts.onPrompt(toPrompt(ended));
	}

	private newId(): string {
		return (this.opts.newId ?? (() => Bun.randomUUIDv7()))();
	}
}
