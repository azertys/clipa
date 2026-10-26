// Reports (spec section 7). All calculation is in ms on half-open intervals.
import { entryInterval } from "./entries";
import { clip, intersect, length, merge, splitByLocalDay, subtract } from "./overlap";
import { expandInstances } from "./recurrence";
import { addLocalDays, localDate, startOfLocalDay } from "./time";
import type { CalendarEvent, EntryWithTags, EventException, Interval, Instance, TimeEntry } from "./types";

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

export type ActivityRow = { app_id: string; window_title?: string | null; started_at: number; ended_at: number };
export type AppRow = { id: string; display_name: string };

export type ReportInput = {
	from: number;
	to: number;
	/** The zone for the per-day split: the device zone. */
	tzid: string;
	/** The end of a running entry. */
	now: number;
	entries: Pick<EntryWithTags, "started_at" | "ended_at" | "tagIds">[];
	events: CalendarEvent[];
	exceptions: EventException[];
	activity: ActivityRow[];
	apps: AppRow[];
	includeAllDay: boolean;
};

export type AppTime = { appId: string; ms: number };

/** Time in one window title of an app. null = no title recorded. */
export type TitleTime = { title: string | null; ms: number };

/** The longest titles per app that a report keeps. */
export const TITLES_PER_APP = 25;

/** The spec's Report, plus the entry count, and planned time, color, all-day and recurring on each event. */
export type Report = {
	range: { from: number; to: number; tzid: string };
	/** Entries with time inside the range. */
	entryCount: number;
	totals: { trackedMs: number; plannedMs: number; coveredMs: number; outsideEventsMs: number };
	days: { date: string; trackedMs: number; plannedMs: number; coveredMs: number }[];
	events: (EventCoverage & {
		eventId: string;
		originalStart: number;
		title: string;
		color: string | null;
		allDay: boolean;
		recurring: boolean;
		start: number;
		end: number;
		apps: AppTime[];
	})[];
	/** tagId null = Untagged. */
	tags: { tagId: string | null; ms: number }[];
	/** titles is empty when no window title was recorded for the app. */
	apps: (AppTime & { name: string; titles: TitleTime[] })[];
};

const byMsDesc = <T extends { ms: number }>(key: (x: T) => string) => (a: T, b: T) =>
	b.ms - a.ms || key(a).localeCompare(key(b));

/** Time per window title, longest first and at most TITLES_PER_APP; none when no title was recorded. */
export function titleList(times: Iterable<[string | null, number]>): TitleTime[] {
	const list = [...times].map(([title, ms]) => ({ title, ms })).filter((t) => t.ms > 0);
	if (list.every((t) => t.title === null)) return [];
	return list.sort(byMsDesc((t) => t.title ?? "")).slice(0, TITLES_PER_APP);
}

/** Sums interval lengths by local date. */
function msByDate(intervals: Interval[], tzid: string): Map<string, number> {
	const out = new Map<string, number>();
	for (const piece of splitByLocalDay(intervals, tzid)) {
		out.set(piece.date, (out.get(piece.date) ?? 0) + piece.end - piece.start);
	}
	return out;
}

/**
 * The report for [from, to).
 * - tracked = merge(clip(entries)): overlapping entries count once.
 * - planned = merge(clip(instances)): clipped to the range, so the totals equal the sum of the days.
 * - Each event gets its full overlap with tracked time, so event times can add up to more than the total.
 * - App time is activity clipped to the range and to tracked time.
 */
export function buildReport(input: ReportInput): Report {
	const { from, to, tzid, now } = input;
	const tracked = trackedIntervals(input.entries, from, to, now);
	const instances = expandInstances(input.events, input.exceptions, from, to).filter(
		(i) => input.includeAllDay || !i.allDay,
	);
	const planned = merge(clip(instances, from, to));
	const covered = intersect(tracked, planned);

	const activityByApp = new Map<string, Interval[]>();
	const activityByTitle = new Map<string, Map<string | null, Interval[]>>();
	for (const a of input.activity) {
		const interval = { start: a.started_at, end: a.ended_at };
		const list = activityByApp.get(a.app_id) ?? [];
		list.push(interval);
		activityByApp.set(a.app_id, list);
		const titles = activityByTitle.get(a.app_id) ?? new Map<string | null, Interval[]>();
		const title = a.window_title ?? null;
		titles.set(title, [...(titles.get(title) ?? []), interval]);
		activityByTitle.set(a.app_id, titles);
	}
	/** The titles of an app inside tracked time. */
	const titlesOf = (appId: string): TitleTime[] =>
		titleList(
			[...(activityByTitle.get(appId) ?? [])].map(([title, list]) => [
				title,
				length(intersect(clip(list, from, to), tracked)),
			]),
		);
	const appTime = new Map<string, Interval[]>();
	for (const [appId, list] of activityByApp) appTime.set(appId, intersect(clip(list, from, to), tracked));
	const appsIn = (window: Interval[]): AppTime[] =>
		[...appTime]
			.map(([appId, intervals]) => ({ appId, ms: length(intersect(intervals, window)) }))
			.filter((a) => a.ms > 0)
			.sort(byMsDesc((a) => a.appId));

	const events = instances.map((i) => ({
		eventId: i.eventId,
		originalStart: i.originalStart,
		title: i.title,
		color: i.color,
		allDay: i.allDay,
		recurring: i.recurring,
		start: i.start,
		end: i.end,
		...eventCoverage(i, tracked, from, to),
		apps: appsIn(clip([i], from, to)),
	}));

	const byTag = new Map<string | null, Interval[]>();
	for (const e of input.entries) {
		const interval = entryInterval(e, now);
		for (const tagId of e.tagIds.length > 0 ? e.tagIds : [null]) {
			const list = byTag.get(tagId) ?? [];
			list.push(interval);
			byTag.set(tagId, list);
		}
	}
	const tags = [...byTag]
		.map(([tagId, list]) => ({ tagId, ms: length(merge(clip(list, from, to))) }))
		.filter((t) => t.ms > 0)
		.sort(byMsDesc((t) => t.tagId ?? ""));

	const names = new Map(input.apps.map((a) => [a.id, a.display_name]));
	const apps = [...appTime]
		.map(([appId, intervals]) => ({
			appId,
			name: names.get(appId) ?? appId,
			ms: length(intervals),
			titles: titlesOf(appId),
		}))
		.filter((a) => a.ms > 0)
		.sort(byMsDesc((a) => a.name));

	const trackedByDay = msByDate(tracked, tzid);
	const plannedByDay = msByDate(planned, tzid);
	const coveredByDay = msByDate(covered, tzid);
	const days: Report["days"] = [];
	for (let day = startOfLocalDay(from, tzid); day < to; day = addLocalDays(day, 1, tzid)) {
		const date = localDate(day, tzid);
		days.push({
			date,
			trackedMs: trackedByDay.get(date) ?? 0,
			plannedMs: plannedByDay.get(date) ?? 0,
			coveredMs: coveredByDay.get(date) ?? 0,
		});
	}

	return {
		range: { from, to, tzid },
		entryCount: input.entries.filter((e) => clip([entryInterval(e, now)], from, to).length > 0).length,
		totals: {
			trackedMs: length(tracked),
			plannedMs: length(planned),
			coveredMs: length(covered),
			outsideEventsMs: length(subtract(tracked, planned)),
		},
		days,
		events,
		tags,
		apps,
	};
}
