import type { Database } from "bun:sqlite";
import type { EntryWithTags } from "../../../core/types";
import type { IdleAction, IdlePrompt, Settings } from "../../shared/rpc-schema";
import { getIdle, purgeActivity, resolveIdle } from "../db/activity";
import type { WriteContext } from "../db/repo";
import type { NativeTracker } from "../native/tracker";
import { IdleMonitor } from "./idle";
import { Sampler } from "./sampler";
import type { TimerService } from "./timer";

const DAY = 86_400_000;

export type TrackingOptions = {
	db: Database;
	ctx: WriteContext;
	tracker: NativeTracker;
	timer: TimerService;
	settings: () => Settings;
	/** Display name of excluded apps */
	excludedName: string;
	onPrompt: (prompt: IdlePrompt) => void;
	/** Tests set these to 0 and drive ticks and polls by hand. */
	intervals?: { sampleMs?: number; flushMs?: number; pollMs?: number };
};

/** Runs the sampler and the idle monitor while the timer runs, and applies idle answers. */
export class Tracking {
	readonly sampler: Sampler;
	readonly idle: IdleMonitor;

	constructor(private readonly opts: TrackingOptions) {
		const { db, ctx, tracker, timer, settings } = opts;
		this.idle = new IdleMonitor({
			db,
			tracker,
			now: ctx.now,
			settings,
			running: () => timer.status(),
			onPrompt: opts.onPrompt,
			pollMs: opts.intervals?.pollMs,
		});
		this.sampler = new Sampler({
			db,
			tracker,
			now: ctx.now,
			settings,
			excludedName: opts.excludedName,
			onSleep: (gap) => this.idle.sleep(gap),
			sampleMs: opts.intervals?.sampleMs,
			flushMs: opts.intervals?.flushMs,
		});
	}

	/** Follows the timer. Call it with the running entry after every timer change. */
	sync(running: EntryWithTags | null): void {
		if (running) {
			this.sampler.start(running.id);
			this.idle.start();
		} else {
			this.sampler.stop();
			this.idle.stop();
		}
	}

	/** Keep, Discard or Discard and stop for an idle period. */
	resolve(id: string, action: IdleAction): void {
		const { db, timer } = this.opts;
		if (action === "keep") {
			resolveIdle(db, id, "kept");
		} else {
			// Write the open segment first, so the split sees all activity of the entry.
			if (this.sampler.entry === getIdle(db, id)?.entry_id) this.sampler.stop();
			timer.discardIdle(id, action === "discardStop");
			this.sync(timer.status());
		}
		this.idle.answered(id);
	}

	/** At app start: idle periods left pending are kept, and old activity is deleted. */
	startup(): { keptIdle: number; purged: number } {
		const { db, ctx, settings } = this.opts;
		const keptIdle = IdleMonitor.keepLeftovers(db, ctx.now());
		const days = settings().activityDays;
		const purged = days > 0 ? purgeActivity(db, ctx.now() - days * DAY) : 0;
		return { keptIdle, purged };
	}
}
