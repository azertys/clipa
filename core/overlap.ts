// Interval functions. All intervals are half-open [start, end) in UTC ms.
import { addLocalDays, localDate, startOfLocalDay } from "./time";
import type { Interval } from "./types";

/** Cuts intervals to [from, to). Drops empty results. Keeps order. */
export function clip(intervals: Interval[], from: number, to: number): Interval[] {
	const out: Interval[] = [];
	for (const { start, end } of intervals) {
		const s = Math.max(start, from);
		const e = Math.min(end, to);
		if (s < e) out.push({ start: s, end: e });
	}
	return out;
}

/** Sorted, disjoint intervals. Touching intervals join. */
export function merge(intervals: Interval[]): Interval[] {
	const sorted = intervals.filter((i) => i.start < i.end).sort((a, b) => a.start - b.start);
	const out: Interval[] = [];
	for (const i of sorted) {
		const last = out[out.length - 1];
		if (last && i.start <= last.end) {
			last.end = Math.max(last.end, i.end);
		} else {
			out.push({ start: i.start, end: i.end });
		}
	}
	return out;
}

/** Time that is in both a and b. Two-pointer sweep, O(n + m). Inputs are merged first. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
	const x = merge(a);
	const y = merge(b);
	const out: Interval[] = [];
	let i = 0;
	let j = 0;
	while (i < x.length && j < y.length) {
		const s = Math.max(x[i].start, y[j].start);
		const e = Math.min(x[i].end, y[j].end);
		if (s < e) out.push({ start: s, end: e });
		if (x[i].end < y[j].end) i++;
		else j++;
	}
	return out;
}

/** Time that is in a and not in b. */
export function subtract(a: Interval[], b: Interval[]): Interval[] {
	const x = merge(a);
	const y = merge(b);
	const out: Interval[] = [];
	let j = 0;
	for (const { start, end } of x) {
		let cursor = start;
		while (j < y.length && y[j].end <= cursor) j++;
		let k = j;
		while (k < y.length && y[k].start < end) {
			if (y[k].start > cursor) out.push({ start: cursor, end: y[k].start });
			cursor = Math.max(cursor, y[k].end);
			k++;
		}
		if (cursor < end) out.push({ start: cursor, end });
	}
	return out;
}

/** Total length in ms. Does not merge: pass merged intervals to count shared time once. */
export function length(intervals: Interval[]): number {
	let total = 0;
	for (const i of intervals) total += Math.max(0, i.end - i.start);
	return total;
}

/** Cuts intervals at local midnight in tzid. Each piece gets its local date (YYYY-MM-DD). */
export function splitByLocalDay(intervals: Interval[], tzid: string): (Interval & { date: string })[] {
	const out: (Interval & { date: string })[] = [];
	for (const { start, end } of intervals) {
		let s = start;
		while (s < end) {
			const nextMidnight = addLocalDays(startOfLocalDay(s, tzid), 1, tzid);
			const e = Math.min(end, nextMidnight);
			out.push({ start: s, end: e, date: localDate(s, tzid) });
			s = e;
		}
	}
	return out;
}

/** Ids of items whose interval shares time with another item. */
export function overlappingIds<T extends Interval & { id: string }>(items: T[]): Set<string> {
	const sorted = [...items].filter((i) => i.start < i.end).sort((a, b) => a.start - b.start);
	const ids = new Set<string>();
	let maxEnd = -Infinity;
	let maxEndId: string | null = null;
	for (const item of sorted) {
		if (maxEndId !== null && item.start < maxEnd) {
			ids.add(item.id);
			ids.add(maxEndId);
		}
		if (item.end > maxEnd) {
			maxEnd = item.end;
			maxEndId = item.id;
		}
	}
	return ids;
}
