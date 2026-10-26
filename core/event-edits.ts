// Creating, editing and deleting events and single occurrences (spec section 6).
// Pure functions: they return the rows to write. The main process writes them in one
// transaction through writeRow(), which stamps the sync columns.
import { allDayDays, firstOccurrence, isOccurrence, isValidRule, occurrenceEnd, occurrenceStarts } from "./recurrence";
import { formatRule, formatUntil, retargetRule, ruleParts } from "./repeat";
import { Temporal } from "./temporal";
import type { CalendarEvent, EditMode, EventException, EventFields, SyncColumns } from "./types";

const DAY = 86_400_000;

type Stamped = "created_at" | "updated_at" | "device_id";

/** A row to write. A soft delete sets deleted_at. */
export type EventRow = Omit<CalendarEvent, Stamped> & Partial<SyncColumns>;
export type ExceptionRow = Omit<EventException, Stamped> & Partial<SyncColumns>;
export type EventWrites = { events: EventRow[]; exceptions: ExceptionRow[] };

export type EditEnv = { now: number; newId: () => string };

export type EventEditReason =
	| "end-before-start"
	| "invalid-rule"
	| "no-occurrences"
	| "not-an-occurrence"
	| "mode-not-allowed";

export class EventEditError extends Error {
	constructor(readonly reason: EventEditReason) {
		super(reason);
	}
}

export function validateFields(fields: EventFields): EventEditReason | null {
	if (fields.end <= fields.start) return "end-before-start";
	if (fields.rrule !== null && !isValidRule(fields.rrule)) return "invalid-rule";
	return null;
}

function zoned(ms: number, tzid: string) {
	return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tzid);
}

function startOfDay(ms: number, tzid: string): number {
	return zoned(ms, tzid).startOfDay().epochMilliseconds;
}

/** The duration to store: real time for a timed event, whole days × 24 h for an all-day event. */
export function storedDuration(start: number, end: number, allDay: boolean): number {
	return allDay ? Math.max(1, Math.round((end - start) / DAY)) * DAY : end - start;
}

/**
 * Moves `ms` by the wall-clock difference between `from` and `to` in tzid. A move from
 * Monday 09:00 to Tuesday 10:00 moves every start by 1 day and 1 hour of local time.
 */
export function shiftWallClock(ms: number, from: number, to: number, tzid: string): number {
	if (from === to) return ms;
	const diff = zoned(from, tzid).toPlainDateTime().until(zoned(to, tzid).toPlainDateTime(), { largestUnit: "days" });
	return zoned(ms, tzid)
		.toPlainDateTime()
		.add(diff)
		.toZonedDateTime(tzid, { disambiguation: "compatible" }).epochMilliseconds;
}

/** Sets starts_at to the first occurrence, so that starts_at is always a real occurrence. */
function normalize(row: EventRow): EventRow {
	if (row.all_day === 1) row.starts_at = startOfDay(row.starts_at, row.tzid);
	const first = firstOccurrence(row);
	if (first === null) throw new EventEditError("no-occurrences");
	row.starts_at = first;
	return row;
}

function softDelete<T extends { deleted_at: number | null }>(row: T, now: number): T {
	return { ...row, deleted_at: now };
}

/** A new event from the dialog fields, in the zone tzid. */
export function createEvent(fields: EventFields, tzid: string, env: EditEnv): EventWrites {
	const error = validateFields(fields);
	if (error) throw new EventEditError(error);
	const row = normalize({
		id: env.newId(),
		title: fields.title.trim(),
		notes: fields.notes,
		color: fields.color,
		starts_at: fields.start,
		duration_ms: storedDuration(fields.start, fields.end, fields.allDay),
		all_day: fields.allDay ? 1 : 0,
		tzid,
		rrule: fields.rrule,
		deleted_at: null,
	});
	return { events: [row], exceptions: [] };
}

type EditInput = {
	event: CalendarEvent;
	/** The event's live exceptions. */
	exceptions: EventException[];
	originalStart: number;
	mode: EditMode;
	env: EditEnv;
};

/** The current values of one occurrence, with its exception applied. */
function current(event: CalendarEvent, exception: EventException | undefined, originalStart: number) {
	const start = exception?.new_starts_at ?? originalStart;
	const duration = exception?.new_duration_ms ?? event.duration_ms;
	return {
		start,
		end: occurrenceEnd(start, duration, event.all_day === 1, event.tzid),
		title: exception?.new_title ?? event.title,
		notes: exception?.new_notes ?? event.notes,
	};
}

/**
 * Applies the dialog changes (or a drag) to one occurrence of an event.
 * One-off events ignore the mode. For a recurring event:
 * - "this": a modified exception for originalStart. The rule, all-day and color cannot change.
 * - "all": the series moves by the same wall-clock difference as the occurrence.
 * - "following": the old series ends before originalStart; a new series starts at the moved occurrence.
 * Without a rule in `changes`, a move to another day moves the rule's weekdays with it.
 */
export function editOccurrence(input: EditInput & { changes: Partial<EventFields> }): EventWrites {
	const { event, exceptions, originalStart, mode, changes, env } = input;
	const live = exceptions.filter((x) => x.deleted_at === null);
	const exception = live.find((x) => x.original_start === originalStart);
	const now = event.rrule === null ? null : current(event, exception, originalStart);
	const base = now ?? {
		start: event.starts_at,
		end: occurrenceEnd(event.starts_at, event.duration_ms, event.all_day === 1, event.tzid),
		title: event.title,
		notes: event.notes,
	};
	const next: EventFields = {
		title: (changes.title ?? base.title).trim(),
		notes: changes.notes ?? base.notes,
		color: changes.color !== undefined ? changes.color : event.color,
		start: changes.start ?? base.start,
		end: changes.end ?? base.end,
		allDay: changes.allDay ?? event.all_day === 1,
		rrule: changes.rrule !== undefined ? changes.rrule : event.rrule,
	};
	const error = validateFields(next);
	if (error) throw new EventEditError(error);
	if (next.allDay) {
		const days = allDayDays(next.end - next.start);
		next.start = startOfDay(next.start, event.tzid);
		next.end = occurrenceEnd(next.start, days * DAY, true, event.tzid);
	}

	if (event.rrule === null) return editAll(event, live, base.start, next, changes, env, false);
	if (!isOccurrence(event, originalStart)) throw new EventEditError("not-an-occurrence");

	if (mode === "this") {
		if (next.rrule !== event.rrule || next.allDay !== (event.all_day === 1) || next.color !== event.color) {
			throw new EventEditError("mode-not-allowed");
		}
		const duration = storedDuration(next.start, next.end, next.allDay);
		const fields = {
			new_starts_at: next.start !== originalStart ? next.start : null,
			new_duration_ms: duration !== event.duration_ms ? duration : null,
			new_title: next.title !== event.title ? next.title : null,
			new_notes: next.notes !== event.notes ? next.notes : null,
		};
		const unchanged = Object.values(fields).every((v) => v === null);
		if (unchanged) return { events: [], exceptions: exception ? [softDelete(exception, env.now)] : [] };
		const row: ExceptionRow = exception
			? { ...exception, kind: "modified", ...fields }
			: { id: env.newId(), event_id: event.id, original_start: originalStart, kind: "modified", deleted_at: null, ...fields };
		return { events: [], exceptions: [row] };
	}

	if (mode === "all" || originalStart <= event.starts_at) {
		// "This and following" from the first occurrence is the whole series.
		return editAll(event, live, now!.start, next, changes, env, mode === "following");
	}

	const countBefore = occurrenceStarts(event, event.starts_at, originalStart).length;
	const oldParts = ruleParts(event.rrule);
	const oldCount = oldParts.get("COUNT");
	oldParts.delete("COUNT");
	oldParts.set("UNTIL", formatUntil(originalStart - 1));
	const oldRow: EventRow = { ...event, rrule: formatRule(oldParts) };

	let rule = changes.rrule !== undefined ? changes.rrule : retargetRule(event.rrule, now!.start, next.start, event.tzid);
	if (rule !== null && oldCount !== undefined) {
		// Keep the total number of occurrences unless the user set a new count.
		const parts = ruleParts(rule);
		if (parts.get("COUNT") === oldCount) {
			parts.set("COUNT", String(Number(oldCount) - countBefore));
			rule = formatRule(parts);
		}
	}
	const newRow = normalize({
		id: env.newId(),
		title: next.title,
		notes: next.notes,
		color: next.color,
		starts_at: shiftWallClock(originalStart, now!.start, next.start, event.tzid),
		duration_ms: storedDuration(next.start, next.end, next.allDay),
		all_day: next.allDay ? 1 : 0,
		tzid: event.tzid,
		rrule: rule,
		deleted_at: null,
	});
	return {
		events: [oldRow, newRow],
		exceptions: live.filter((x) => x.original_start >= originalStart).map((x) => softDelete(x, env.now)),
	};
}

/** Updates the whole event. Exceptions are dropped when the timing changes, or always for a split at the first occurrence. */
function editAll(
	event: CalendarEvent,
	live: EventException[],
	from: number,
	next: EventFields,
	changes: Partial<EventFields>,
	env: EditEnv,
	dropExceptions: boolean,
): EventWrites {
	const rule =
		changes.rrule !== undefined || event.rrule === null
			? next.rrule
			: retargetRule(event.rrule, from, next.start, event.tzid);
	const row = normalize({
		...event,
		title: next.title,
		notes: next.notes,
		color: next.color,
		starts_at: shiftWallClock(event.starts_at, from, next.start, event.tzid),
		duration_ms: storedDuration(next.start, next.end, next.allDay),
		all_day: next.allDay ? 1 : 0,
		rrule: rule,
	});
	const timingChanged = row.starts_at !== event.starts_at || row.rrule !== event.rrule || row.all_day !== event.all_day;
	const drop = dropExceptions || timingChanged;
	return { events: [row], exceptions: drop ? live.map((x) => softDelete(x, env.now)) : [] };
}

/**
 * Deletes one occurrence, this and the following occurrences, or the whole event.
 * One-off events ignore the mode.
 */
export function deleteOccurrence(input: EditInput): EventWrites {
	const { event, exceptions, originalStart, mode, env } = input;
	const live = exceptions.filter((x) => x.deleted_at === null);
	const all = (): EventWrites => ({
		events: [softDelete(event, env.now)],
		exceptions: live.map((x) => softDelete(x, env.now)),
	});
	if (event.rrule === null || mode === "all") return all();
	if (!isOccurrence(event, originalStart)) throw new EventEditError("not-an-occurrence");

	if (mode === "this") {
		const exception = live.find((x) => x.original_start === originalStart);
		const cleared = { kind: "cancelled" as const, new_starts_at: null, new_duration_ms: null, new_title: null, new_notes: null };
		const row: ExceptionRow = exception
			? { ...exception, ...cleared }
			: { id: env.newId(), event_id: event.id, original_start: originalStart, deleted_at: null, ...cleared };
		return { events: [], exceptions: [row] };
	}

	if (originalStart <= event.starts_at) return all();
	const parts = ruleParts(event.rrule);
	parts.delete("COUNT");
	parts.set("UNTIL", formatUntil(originalStart - 1));
	return {
		events: [{ ...event, rrule: formatRule(parts) }],
		exceptions: live.filter((x) => x.original_start >= originalStart).map((x) => softDelete(x, env.now)),
	};
}
