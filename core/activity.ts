// Application tracking (spec section 8) and the idle split (section 5). Pure logic:
// the sampler service feeds samples in and writes what comes out.
import type { Interval } from "./types";

/** Segments shorter than this join the previous segment. */
export const MIN_SEGMENT_MS = 2_000;
/** A longer time between two samples means the system slept. */
export const SLEEP_GAP_MS = 15_000;
/** The shortest entry the timer keeps (src/bun/services/timer.ts). */
const MIN_ENTRY_MS = 1_000;

/** One reading of the frontmost app. appKey is the bundle id on macOS. */
export type Sample = { at: number; appKey: string; appName: string; title: string | null };

/** Time in one app with one window title. The id stays the same while the segment grows. */
export type Segment = { id: string; appKey: string; appName: string; title: string | null; start: number; end: number };

/**
 * Turns 1-second samples into segments. A segment stays open while the app and title stay
 * the same. Each call returns the segments to write (inserted or updated by id).
 */
export class Segmenter {
	private open: Segment | null = null;
	/** The last closed segment, which a short segment after it joins. */
	private last: Segment | null = null;
	private lastSampleAt: number | null = null;

	constructor(private readonly newId: () => string) {}

	/** Adds a sample. `gap` is set when the time since the last sample shows that the system slept. */
	sample(s: Sample): { writes: Segment[]; gap: Interval | null } {
		const writes: Segment[] = [];
		let gap: Interval | null = null;
		if (this.lastSampleAt !== null && s.at - this.lastSampleAt > SLEEP_GAP_MS) {
			gap = { start: this.lastSampleAt, end: s.at };
			writes.push(...this.closeOpen(this.lastSampleAt));
			this.last = null;
		}
		this.lastSampleAt = s.at;
		if (this.open && this.open.appKey === s.appKey && this.open.title === s.title) {
			this.open.end = s.at;
			return { writes, gap };
		}
		writes.push(...this.closeOpen(s.at));
		this.open = { id: this.newId(), appKey: s.appKey, appName: s.appName, title: s.title, start: s.at, end: s.at };
		return { writes, gap };
	}

	/** The open segment up to `at`, for the periodic flush. Short segments wait. */
	flush(at: number): Segment[] {
		if (!this.open) return [];
		this.open.end = Math.max(this.open.end, at);
		return this.open.end - this.open.start >= MIN_SEGMENT_MS ? [{ ...this.open }] : [];
	}

	/** Closes the open segment at `at` (the timer stopped). */
	stop(at: number): Segment[] {
		const writes = this.closeOpen(at);
		this.last = null;
		this.lastSampleAt = null;
		return writes;
	}

	/**
	 * The event loop was blocked by a native dialog in Clipa, and the system did not sleep. The
	 * open segment (Clipa) runs on to `at`, and the next sample reports no gap.
	 */
	resume(at: number): void {
		if (this.lastSampleAt === null) return;
		if (this.open) this.open.end = Math.max(this.open.end, at);
		this.lastSampleAt = at;
	}

	/** The open segment, for live totals. */
	current(): Segment | null {
		return this.open ? { ...this.open } : null;
	}

	private closeOpen(at: number): Segment[] {
		const open = this.open;
		this.open = null;
		if (!open) return [];
		open.end = Math.max(open.end, at);
		if (open.end - open.start >= MIN_SEGMENT_MS) {
			this.last = open;
			return [{ ...open }];
		}
		// Too short: the time goes to the previous segment when it ends where this one starts.
		if (this.last && this.last.end === open.start) {
			this.last.end = open.end;
			return [{ ...this.last }];
		}
		return [];
	}
}

/** An activity row as stored (local-only table). */
export type ActivityRow = {
	id: string;
	entry_id: string;
	app_id: string;
	window_title: string | null;
	started_at: number;
	ended_at: number;
};

export type IdleDiscardPlan = {
	/** The original entry: a new end, or deleted when less than 1 s is left before the idle time. */
	first: { ended_at: number; deleted: boolean };
	/** The new entry after the idle time (same note and tags), or null. */
	second: { started_at: number; ended_at: number | null } | null;
	/** Activity rows to write. Rows of the new entry have entry_id = "" for the caller to fill. */
	upserts: ActivityRow[];
	deletes: string[];
};

/**
 * "Discard" and "Discard and stop" for an idle period (spec section 5).
 * Discard: the entry ends at the idle start and a new entry starts at the idle end.
 * Discard and stop: the entry ends at the idle start. Activity inside the idle time is deleted;
 * activity after it moves to the new entry, or is deleted when there is none.
 * Returns null when the idle time does not overlap the entry.
 */
export function planIdleDiscard(input: {
	entry: { started_at: number; ended_at: number | null };
	idle: Interval;
	activity: ActivityRow[];
	stop: boolean;
	newId: () => string;
}): IdleDiscardPlan | null {
	const { entry, idle, activity, stop, newId } = input;
	const s = Math.max(idle.start, entry.started_at);
	const e = entry.ended_at === null ? idle.end : Math.min(idle.end, entry.ended_at);
	if (e <= s) return null;

	const firstDeleted = s - entry.started_at < MIN_ENTRY_MS;
	const first = { ended_at: firstDeleted ? entry.started_at + MIN_ENTRY_MS : s, deleted: firstDeleted };
	let second: IdleDiscardPlan["second"] = null;
	if (!stop && (entry.ended_at === null || entry.ended_at - e >= MIN_ENTRY_MS)) {
		second = { started_at: e, ended_at: entry.ended_at };
	}

	const upserts: ActivityRow[] = [];
	const deletes: string[] = [];
	for (const row of activity) {
		const before = !firstDeleted && row.started_at < s ? { start: row.started_at, end: Math.min(row.ended_at, s) } : null;
		const after = second && row.ended_at > e ? { start: Math.max(row.started_at, e), end: row.ended_at } : null;
		if (!before && !after) {
			deletes.push(row.id);
			continue;
		}
		if (before) {
			if (before.end !== row.ended_at) upserts.push({ ...row, ended_at: before.end });
		}
		if (after) {
			upserts.push({ ...row, id: before ? newId() : row.id, entry_id: "", started_at: after.start });
		}
	}
	return { first, second, upserts, deletes };
}
