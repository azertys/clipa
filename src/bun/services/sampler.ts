import type { Database } from "bun:sqlite";
import { Segmenter, type Segment } from "../../../core/activity";
import { titleList, type TitleTime } from "../../../core/reports";
import type { Interval } from "../../../core/types";
import type { Settings } from "../../shared/rpc-schema";
import { activityOfEntry, appFor, writeSegment } from "../db/activity";
import type { NativeTracker } from "../native/tracker";

export const SAMPLE_MS = 1_000;
export const FLUSH_MS = 30_000;
/** The app key that stands for every app in the "Do not record" list. */
export const EXCLUDED_KEY = "clipa.excluded";

export type LiveAppTime = { name: string; ms: number; titles: TitleTime[] };

export type SamplerOptions = {
	db: Database;
	tracker: NativeTracker;
	now: () => number;
	settings: () => Settings;
	/** Display name of the excluded apps, from strings.ts */
	excludedName: string;
	/** The time between two samples showed that the system slept. */
	onSleep?: (gap: Interval) => void;
	newId?: () => string;
	/** Tests run ticks by hand with 0. */
	sampleMs?: number;
	flushMs?: number;
};

/**
 * Records the frontmost app (and the window title, if allowed) once a second while the timer
 * runs. Segments are written when they close, and the open one every 30 s.
 */
export class Sampler {
	private entryId: string | null = null;
	private segmenter: Segmenter | null = null;
	private intervals: ReturnType<typeof setInterval>[] = [];
	private appIds = new Map<string, string>();
	private lastError: string | null = null;

	constructor(private readonly opts: SamplerOptions) {}

	/** The entry the sampler records for, or null. */
	get entry(): string | null {
		return this.entryId;
	}

	start(entryId: string): void {
		if (this.entryId === entryId) return;
		this.stop();
		this.entryId = entryId;
		this.segmenter = new Segmenter(this.opts.newId ?? (() => Bun.randomUUIDv7()));
		const sampleMs = this.opts.sampleMs ?? SAMPLE_MS;
		const flushMs = this.opts.flushMs ?? FLUSH_MS;
		if (sampleMs > 0) this.intervals.push(setInterval(() => this.tick(), sampleMs));
		if (flushMs > 0) this.intervals.push(setInterval(() => this.flush(), flushMs));
		this.tick();
	}

	/** Closes the open segment at now and stops sampling. */
	stop(): void {
		for (const i of this.intervals) clearInterval(i);
		this.intervals = [];
		if (this.segmenter) this.write(this.segmenter.stop(this.opts.now()));
		this.segmenter = null;
		this.entryId = null;
	}

	tick(): void {
		if (!this.segmenter) return;
		const settings = this.opts.settings();
		const at = this.opts.now();
		const app = this.safely(() => this.opts.tracker.frontmostApp());
		// Without an app nothing is recorded, but the time since the last sample still shows a sleep.
		if (!app) return this.record(this.segmenter.none(at));
		const excluded = settings.excludedApps.includes(app.key);
		const titled = settings.recordTitles && !excluded && !settings.noTitleApps.includes(app.key);
		const title = titled ? this.safely(() => this.opts.tracker.focusedWindowTitle()) : null;
		this.record(
			this.segmenter.sample(
				excluded
					? { at, appKey: EXCLUDED_KEY, appName: this.opts.excludedName, title: null }
					: { at, appKey: app.key, appName: app.name, title },
			),
		);
	}

	/** Call after a blocking native dialog: the time is not a sleep gap. */
	resume(): void {
		this.segmenter?.resume(this.opts.now());
	}

	flush(): void {
		if (this.segmenter) this.write(this.segmenter.flush(this.opts.now()));
	}

	/** Time per app (and per window title) of the running entry, with the open segment. */
	liveAppTimes(): LiveAppTime[] {
		if (!this.entryId || !this.segmenter) return [];
		const open = this.segmenter.current();
		const apps = new Map<string, Map<string | null, number>>();
		const add = (appId: string, title: string | null, ms: number) => {
			const titles = apps.get(appId) ?? new Map<string | null, number>();
			titles.set(title, (titles.get(title) ?? 0) + ms);
			apps.set(appId, titles);
		};
		for (const row of activityOfEntry(this.opts.db, this.entryId)) {
			if (row.id !== open?.id) add(row.app_id, row.window_title, row.ended_at - row.started_at);
		}
		if (open) add(this.appId(open), open.title, Math.max(0, this.opts.now() - open.start));
		const names = new Map(
			(this.opts.db.query("SELECT id, display_name FROM apps").all() as { id: string; display_name: string }[]).map(
				(a) => [a.id, a.display_name],
			),
		);
		return [...apps]
			.map(([id, titles]) => ({
				name: names.get(id) ?? id,
				ms: [...titles.values()].reduce((sum, ms) => sum + ms, 0),
				titles: titleList(titles),
			}))
			.filter((a) => a.ms > 0)
			.sort((a, b) => b.ms - a.ms);
	}

	private record({ writes, gap }: { writes: Segment[]; gap: Interval | null }) {
		this.write(writes);
		if (gap) this.opts.onSleep?.(gap);
	}

	private write(segments: Segment[]) {
		if (!this.entryId || segments.length === 0) return;
		const entryId = this.entryId;
		this.opts.db.transaction(() => {
			for (const segment of segments) writeSegment(this.opts.db, entryId, this.appId(segment), segment);
		})();
	}

	private appId(segment: Segment): string {
		const cacheKey = `${segment.appKey}\u0000${segment.appName}`;
		let id = this.appIds.get(cacheKey);
		if (!id) {
			id = appFor(this.opts.db, segment.appKey, segment.appName).id;
			this.appIds.set(cacheKey, id);
		}
		return id;
	}

	/** A failing native call records nothing for this second; it never stops the sampler. */
	private safely<T>(read: () => T): T | null {
		try {
			return read();
		} catch (error) {
			// Log each different error once, not once a second.
			const message = String(error);
			if (message !== this.lastError) console.warn("[clipa] sampler:", message);
			this.lastError = message;
			return null;
		}
	}
}
