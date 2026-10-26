// Report calculations (spec section 7). M2 has the per-event coverage that the Today screen
// uses. M3 adds the full report.
import { entryInterval } from "./entries";
import { clip, intersect, length, merge } from "./overlap";
import type { Interval, Instance, TimeEntry } from "./types";

/** Tracked time in [from, to): the entries clipped and merged, so overlapping entries count once. */
export function trackedIntervals(
	entries: Pick<TimeEntry, "started_at" | "ended_at">[],
	from: number,
	to: number,
	now: number,
): Interval[] {
	return merge(clip(entries.map((e) => entryInterval(e, now)), from, to));
}

export type EventCoverage = {
	plannedMs: number;
	trackedMs: number;
	/** 0..1 of the clipped event length. */
	coverage: number;
	segments: Interval[];
	/** True when the range cut the event. */
	partial: boolean;
};

/** The part of an event instance that has tracked time, inside [from, to). */
export function eventCoverage(instance: Interval, tracked: Interval[], from: number, to: number): EventCoverage {
	const clipped = clip([{ start: instance.start, end: instance.end }], from, to);
	const segments = intersect(tracked, clipped);
	const plannedMs = length(clipped);
	const trackedMs = length(segments);
	return {
		plannedMs,
		trackedMs,
		coverage: plannedMs === 0 ? 0 : trackedMs / plannedMs,
		segments,
		partial: instance.start < from || instance.end > to,
	};
}

/** Timed instances with their coverage. All-day instances are left out, as in reports (section 7). */
export function coverageList(instances: Instance[], tracked: Interval[], from: number, to: number) {
	return instances.filter((i) => !i.allDay).map((instance) => ({ instance, ...eventCoverage(instance, tracked, from, to) }));
}
