// Pure helpers for time entries.
import { clip, length, merge } from "./overlap";
import type { EntryWithTags, Interval, TimeEntry } from "./types";

/** The interval of an entry. A running entry ends at now. */
export function entryInterval(entry: Pick<TimeEntry, "started_at" | "ended_at">, now: number): Interval {
	return { start: entry.started_at, end: entry.ended_at ?? Math.max(now, entry.started_at) };
}

/** Tracked time in [from, to). Overlapping entries count once. */
export function trackedMs(entries: Pick<TimeEntry, "started_at" | "ended_at">[], from: number, to: number, now: number): number {
	return length(merge(clip(entries.map((e) => entryInterval(e, now)), from, to)));
}

export type EntryError = "end-before-start" | "start-in-future";

/** Checks a manual entry. ended_at null means "running" and is allowed. */
export function validateEntry(
	entry: Pick<TimeEntry, "started_at" | "ended_at">,
	now: number,
): EntryError | null {
	if (entry.ended_at !== null && entry.ended_at <= entry.started_at) return "end-before-start";
	if (entry.started_at > now) return "start-in-future";
	return null;
}

/** The first non-empty line of a note, for lists. */
export function firstLine(note: string): string {
	return note.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
}

export type Combo = { note: string; tagIds: string[] };

/**
 * The last `limit` distinct note + tag combinations, newest first.
 * The same note with the same tags (in any order) counts once.
 */
export function recentCombos(entries: EntryWithTags[], limit: number): Combo[] {
	const sorted = [...entries].sort((a, b) => b.started_at - a.started_at);
	const seen = new Set<string>();
	const out: Combo[] = [];
	for (const e of sorted) {
		const tagIds = [...e.tagIds].sort();
		const key = JSON.stringify([e.note.trim(), tagIds]);
		if (seen.has(key)) continue;
		if (e.note.trim() === "" && tagIds.length === 0) continue;
		seen.add(key);
		out.push({ note: e.note, tagIds });
		if (out.length === limit) break;
	}
	return out;
}
