// Event expansion. The calendar and the reports both use expandInstances().
//
// rrule runs in floating mode: a Date's UTC fields hold the local wall-clock time of the
// event's zone. Temporal converts each wall-clock time to an instant. rrule's own tzid
// support gives results that depend on the process time zone.
import { RRule } from "rrule";
import { formatRule, parseUntil, ruleParts } from "./repeat";
import { Temporal } from "./temporal";
import type { CalendarEvent, EventException, Instance } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The most occurrences one event generates in one call. A daily event over 50 years is ~18 000. */
export const MAX_OCCURRENCES = 20_000;

// Temporal's instant range is ±8.64e15 ms. Keep a day of margin for the floating conversion.
const MIN_MS = -8.64e15 + 2 * DAY;
const MAX_MS = 8.64e15 - 2 * DAY;
const clampMs = (ms: number) => Math.min(MAX_MS, Math.max(MIN_MS, ms));

/** True when the half-open intervals [aStart, aEnd) and [bStart, bEnd) share time. */
export function touches(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

/** The wall-clock time of an instant in tzid, as a floating Date. */
function toFloating(ms: number, tzid: string): Date {
	const p = Temporal.Instant.fromEpochMilliseconds(clampMs(ms)).toZonedDateTimeISO(tzid).toPlainDateTime();
	return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond));
}

/** The instant of a floating Date in tzid. A gap moves forward by its length; an overlap takes the earlier instant. */
function fromFloating(date: Date, tzid: string): number {
	return Temporal.PlainDateTime.from({
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate(),
		hour: date.getUTCHours(),
		minute: date.getUTCMinutes(),
		second: date.getUTCSeconds(),
		millisecond: date.getUTCMilliseconds(),
	}).toZonedDateTime(tzid, { disambiguation: "compatible" }).epochMilliseconds;
}

type Series = { rule: RRule; until: number | null };

/** The rrule object for a recurring event. UNTIL is kept apart and compared as an instant. */
function series(event: Pick<CalendarEvent, "rrule" | "starts_at" | "tzid">): Series {
	if (event.rrule === null) throw new Error("series: the event does not recur");
	const parts = ruleParts(event.rrule);
	const until = parts.get("UNTIL");
	parts.delete("UNTIL");
	parts.delete("DTSTART");
	const options = RRule.parseString(formatRule(parts));
	if (options.freq === undefined) throw new Error("series: RRULE without FREQ");
	return {
		rule: new RRule({ ...options, dtstart: toFloating(event.starts_at, event.tzid), tzid: null }),
		until: until === undefined ? null : parseUntil(until, event.tzid),
	};
}

/** True when the rule parses and has a frequency. */
export function isValidRule(rrule: string): boolean {
	try {
		series({ rrule, starts_at: 0, tzid: "UTC" });
		return true;
	} catch {
		return false;
	}
}

/** Starts (UTC ms) of the generated occurrences with from <= start < to, in order. */
export function occurrenceStarts(
	event: Pick<CalendarEvent, "rrule" | "starts_at" | "tzid">,
	from: number,
	to: number,
): number[] {
	if (event.rrule === null) return from <= event.starts_at && event.starts_at < to ? [event.starts_at] : [];
	const { rule, until } = series(event);
	const end = until === null ? to : Math.min(to, until + 1);
	const start = Math.max(from, event.starts_at);
	if (end <= start) return [];
	// Zone offsets are below one day, so a one-day margin on the wall-clock bounds is enough.
	const after = new Date(toFloating(start, event.tzid).getTime() - DAY);
	const before = new Date(toFloating(end, event.tzid).getTime() + DAY);
	const out: number[] = [];
	rule.between(after, before, true, (date, i) => {
		const ms = fromFloating(date, event.tzid);
		if (ms >= start && ms < end) out.push(ms);
		return i < MAX_OCCURRENCES;
	});
	return out;
}

/** The first occurrence at or after the event's starts_at, or null if the rule gives none. */
export function firstOccurrence(event: Pick<CalendarEvent, "rrule" | "starts_at" | "tzid">): number | null {
	if (event.rrule === null) return event.starts_at;
	const { rule, until } = series(event);
	const next = rule.after(new Date(toFloating(event.starts_at, event.tzid).getTime() - 1), true);
	if (next === null) return null;
	const ms = fromFloating(next, event.tzid);
	return until !== null && ms > until ? null : ms;
}

/** True when the series generates an occurrence that starts at exactly `start`. */
export function isOccurrence(event: Pick<CalendarEvent, "rrule" | "starts_at" | "tzid">, start: number): boolean {
	return occurrenceStarts(event, start, start + 1).length === 1;
}

/** Number of whole days an all-day event covers. duration_ms is days × 24 h. */
export function allDayDays(durationMs: number): number {
	return Math.max(1, Math.round(durationMs / DAY));
}

/**
 * End of an occurrence. A timed event lasts durationMs of real time. An all-day event
 * ends at local midnight N days after its start day, so DST days are 23 or 25 h long.
 */
export function occurrenceEnd(start: number, durationMs: number, allDay: boolean, tzid: string): number {
	if (!allDay) return start + durationMs;
	return Temporal.Instant.fromEpochMilliseconds(start)
		.toZonedDateTimeISO(tzid)
		.startOfDay()
		.add({ days: allDayDays(durationMs) })
		.startOfDay().epochMilliseconds;
}

/** The instance for one generated occurrence, with its exception applied. Null if cancelled. */
function instanceAt(event: CalendarEvent, originalStart: number, exception: EventException | undefined): Instance | null {
	if (exception?.kind === "cancelled") return null;
	const allDay = event.all_day === 1;
	const start = exception?.new_starts_at ?? originalStart;
	const duration = exception?.new_duration_ms ?? event.duration_ms;
	return {
		eventId: event.id,
		originalStart,
		start,
		end: occurrenceEnd(start, duration, allDay, event.tzid),
		title: exception?.new_title ?? event.title,
		notes: exception?.new_notes ?? event.notes,
		color: event.color,
		allDay,
		recurring: event.rrule !== null,
		isException: exception !== undefined,
	};
}

/**
 * The instances of the events that touch [from, to), sorted by start.
 * A recurring event generates occurrences from from − duration to to, in local wall-clock time
 * of its zone. Cancelled exceptions remove an occurrence. Modified exceptions replace its fields,
 * also when the change moves the occurrence into or out of the range.
 */
export function expandInstances(
	events: CalendarEvent[],
	exceptions: EventException[],
	from: number,
	to: number,
): Instance[] {
	const byEvent = new Map<string, Map<number, EventException>>();
	for (const x of exceptions) {
		if (x.deleted_at !== null) continue;
		let map = byEvent.get(x.event_id);
		if (!map) byEvent.set(x.event_id, (map = new Map()));
		map.set(x.original_start, x);
	}

	const out: Instance[] = [];
	const keep = (instance: Instance | null) => {
		if (instance && touches(instance.start, instance.end, from, to)) out.push(instance);
	};

	for (const event of events) {
		if (event.deleted_at !== null) continue;
		if (event.rrule === null) {
			keep(instanceAt(event, event.starts_at, undefined));
			continue;
		}
		const own = byEvent.get(event.id) ?? new Map<number, EventException>();
		// An all-day occurrence on a DST day is up to one hour longer than duration_ms.
		const generated = new Set(occurrenceStarts(event, from - event.duration_ms - HOUR, to));
		for (const start of generated) keep(instanceAt(event, start, own.get(start)));
		// Occurrences that a modified exception moved into the range from outside it.
		for (const x of own.values()) {
			if (x.kind !== "modified" || generated.has(x.original_start)) continue;
			const moved = instanceAt(event, x.original_start, x);
			if (moved && touches(moved.start, moved.end, from, to) && isOccurrence(event, x.original_start)) {
				out.push(moved);
			}
		}
	}
	return out.sort((a, b) => a.start - b.start || a.eventId.localeCompare(b.eventId));
}
