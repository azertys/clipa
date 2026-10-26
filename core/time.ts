// Time formatting and local-day helpers. Pure functions: the caller passes
// the time zone and "now". Do not use the local-time getters of Date.
import { Temporal } from "./temporal";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Duration as H:MM. Rounds down to the minute. */
export function formatDuration(ms: number): string {
	const totalMinutes = Math.floor(Math.max(0, ms) / MINUTE);
	return `${Math.floor(totalMinutes / 60)}:${pad2(totalMinutes % 60)}`;
}

/** Duration as H:MM:SS. Rounds down to the second. */
export function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(Math.max(0, ms) / SECOND);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	return `${h}:${pad2(m)}:${pad2(totalSeconds % 60)}`;
}

/** Ratio 0..1 as a percentage with one decimal, for example "50.0%". */
export function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

export function toZoned(ms: number, tzid: string) {
	return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tzid);
}

/** Local wall-clock time as HH:MM. */
export function formatClock(ms: number, tzid: string): string {
	const z = toZoned(ms, tzid);
	return `${pad2(z.hour)}:${pad2(z.minute)}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(ms: number, tzid: string): string {
	return toZoned(ms, tzid).toPlainDate().toString();
}

/** UTC ms of local 00:00 on the day that contains ms. */
export function startOfLocalDay(ms: number, tzid: string): number {
	return toZoned(ms, tzid).startOfDay().epochMilliseconds;
}

/** UTC ms of local 00:00, `days` calendar days after the day that contains ms. */
export function addLocalDays(ms: number, days: number, tzid: string): number {
	return toZoned(ms, tzid).startOfDay().add({ days }).startOfDay().epochMilliseconds;
}

/** UTC ms of local 00:00 for a YYYY-MM-DD date. */
export function localDateStart(date: string, tzid: string): number {
	return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: tzid }).epochMilliseconds;
}

/** UTC ms of local 00:00 on the Monday of the week that contains ms. */
export function startOfLocalWeek(ms: number, tzid: string): number {
	const day = toZoned(ms, tzid).startOfDay();
	return day.subtract({ days: day.dayOfWeek - 1 }).startOfDay().epochMilliseconds;
}

/** ISO 8601 local time with offset, for example 2026-10-26T09:00:00+02:00. */
export function isoLocal(ms: number, tzid: string): string {
	return toZoned(ms, tzid).toString({ timeZoneName: "never", smallestUnit: "second" });
}

/** Value for <input type="datetime-local">: local YYYY-MM-DDTHH:MM. */
export function toLocalInput(ms: number, tzid: string): string {
	return toZoned(ms, tzid).toPlainDateTime().toString({ smallestUnit: "minute" });
}

/** Parses a datetime-local value as wall-clock time in tzid. Gaps move forward, overlaps take the earlier instant. */
export function fromLocalInput(value: string, tzid: string): number | null {
	try {
		return Temporal.PlainDateTime.from(value).toZonedDateTime(tzid, { disambiguation: "compatible" }).epochMilliseconds;
	} catch {
		return null;
	}
}

/** UTC ms of local 00:00 on the first day of the month that contains ms, moved by `months`. */
export function startOfLocalMonth(ms: number, tzid: string, months = 0): number {
	return toZoned(ms, tzid).with({ day: 1 }).startOfDay().add({ months }).startOfDay().epochMilliseconds;
}

export type RangePreset = "today" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";

/** The half-open range [from, to) of a report preset. Weeks start on Monday. */
export function presetRange(preset: RangePreset, now: number, tzid: string): { from: number; to: number } {
	switch (preset) {
		case "today": {
			const from = startOfLocalDay(now, tzid);
			return { from, to: addLocalDays(from, 1, tzid) };
		}
		case "thisWeek": {
			const from = startOfLocalWeek(now, tzid);
			return { from, to: addLocalDays(from, 7, tzid) };
		}
		case "lastWeek": {
			const to = startOfLocalWeek(now, tzid);
			return { from: addLocalDays(to, -7, tzid), to };
		}
		case "thisMonth":
			return { from: startOfLocalMonth(now, tzid), to: startOfLocalMonth(now, tzid, 1) };
		case "lastMonth":
			return { from: startOfLocalMonth(now, tzid, -1), to: startOfLocalMonth(now, tzid) };
	}
}

/** The range for two local dates, both included. */
export function dateRange(fromDate: string, toDate: string, tzid: string): { from: number; to: number } {
	return { from: localDateStart(fromDate, tzid), to: addLocalDays(localDateStart(toDate, tzid), 1, tzid) };
}
