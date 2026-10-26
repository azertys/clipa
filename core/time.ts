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

/** Local wall-clock time as HH:MM, or as 8:30 AM with hour12. */
export function formatClock(ms: number, tzid: string, hour12 = false): string {
	const z = toZoned(ms, tzid);
	if (!hour12) return `${pad2(z.hour)}:${pad2(z.minute)}`;
	return `${z.hour % 12 || 12}:${pad2(z.minute)} ${z.hour < 12 ? "AM" : "PM"}`;
}

/**
 * "13:05", "1305", "9.30", "8:30 PM" or "8pm" as minutes since midnight.
 * Null when the text is not a time.
 */
export function parseClock(text: string): number | null {
	const m = /^\s*(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(text);
	if (!m || (m[2] === undefined && m[3] === undefined)) return null;
	let h = Number(m[1]);
	const min = Number(m[2] ?? "0");
	if (min > 59) return null;
	if (m[3]) {
		if (h < 1 || h > 12) return null;
		h = (h % 12) + (m[3][0].toLowerCase() === "p" ? 12 : 0);
	}
	return h > 23 ? null : h * 60 + min;
}

/** "1:45" (hours and minutes) or "105" (minutes) as ms. Null when the text is not a duration. */
export function parseDuration(text: string): number | null {
	const t = text.trim();
	const hm = /^(\d+):(\d{2})$/.exec(t);
	if (hm) return Number(hm[2]) < 60 ? (Number(hm[1]) * 60 + Number(hm[2])) * MINUTE : null;
	return /^\d+$/.test(t) ? Number(t) * MINUTE : null;
}

/** UTC ms of a local date (YYYY-MM-DD) at `minutes` after midnight. A time in a DST gap moves forward. */
export function atLocalMinutes(date: string, minutes: number, tzid: string): number {
	return Temporal.PlainDate.from(date)
		.toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
		.toZonedDateTime(tzid, { disambiguation: "compatible" }).epochMilliseconds;
}

/** Minutes since local midnight. */
export function localMinutes(ms: number, tzid: string): number {
	const z = toZoned(ms, tzid);
	return z.hour * 60 + z.minute;
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

/** 1 = weeks start on Monday, 7 = on Sunday (ISO day numbers). */
export type WeekStart = 1 | 7;

/** UTC ms of local 00:00 on the first day of the week that contains ms. */
export function startOfLocalWeek(ms: number, tzid: string, weekStart: WeekStart = 1): number {
	const day = toZoned(ms, tzid).startOfDay();
	return day.subtract({ days: (day.dayOfWeek - weekStart + 7) % 7 }).startOfDay().epochMilliseconds;
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

/** The half-open range [from, to) of a report preset. */
export function presetRange(
	preset: RangePreset,
	now: number,
	tzid: string,
	weekStart: WeekStart = 1,
): { from: number; to: number } {
	switch (preset) {
		case "today": {
			const from = startOfLocalDay(now, tzid);
			return { from, to: addLocalDays(from, 1, tzid) };
		}
		case "thisWeek": {
			const from = startOfLocalWeek(now, tzid, weekStart);
			return { from, to: addLocalDays(from, 7, tzid) };
		}
		case "lastWeek": {
			const to = startOfLocalWeek(now, tzid, weekStart);
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
