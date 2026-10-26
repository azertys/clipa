import type { Database } from "bun:sqlite";
import {
	createEvent,
	deleteOccurrence,
	editOccurrence,
	EventEditError,
	type EventEditReason,
	type EventWrites,
} from "../../../core/event-edits";
import { expandInstances } from "../../../core/recurrence";
import type { CalendarEvent, EditMode, EventException, EventFields, Instance } from "../../../core/types";
import { AppError, writeRow, type WriteContext } from "./repo";

const ERROR_CODES: Record<EventEditReason, string> = {
	"end-before-start": "EVENT_END_BEFORE_START",
	"invalid-rule": "EVENT_RULE_INVALID",
	"no-occurrences": "EVENT_NO_OCCURRENCES",
	"not-an-occurrence": "EVENT_NOT_AN_OCCURRENCE",
	"mode-not-allowed": "EVENT_MODE_NOT_ALLOWED",
};

export function getEvent(db: Database, id: string): CalendarEvent | null {
	return db.query("SELECT * FROM events WHERE id = ?").get(id) as CalendarEvent | null;
}

export function liveExceptions(db: Database, eventId: string): EventException[] {
	return db
		.query("SELECT * FROM event_exceptions WHERE event_id = ? AND deleted_at IS NULL ORDER BY original_start")
		.all(eventId) as EventException[];
}

/**
 * Live events that can have an instance in [from, to), with their live exceptions.
 * One-off events must overlap the range. Recurring events must start before its end.
 * Events with an occurrence moved into the range by an exception are also loaded.
 */
export function eventsForRange(db: Database, from: number, to: number) {
	const events = db
		.query(
			`SELECT * FROM events WHERE deleted_at IS NULL AND (
				(rrule IS NULL AND starts_at < $to AND starts_at + duration_ms + 3600000 > $from)
				OR (rrule IS NOT NULL AND starts_at < $to)
				OR id IN (SELECT event_id FROM event_exceptions
					WHERE deleted_at IS NULL AND kind = 'modified' AND new_starts_at < $to)
			)`,
		)
		.all({ from, to }) as CalendarEvent[];
	const ids = events.filter((e) => e.rrule !== null).map((e) => e.id);
	const exceptions =
		ids.length === 0
			? []
			: (db
					.query(
						`SELECT * FROM event_exceptions WHERE deleted_at IS NULL
						 AND event_id IN (SELECT value FROM json_each(?))`,
					)
					.all(JSON.stringify(ids)) as EventException[]);
	return { events, exceptions };
}

export function listInstances(db: Database, from: number, to: number): Instance[] {
	const { events, exceptions } = eventsForRange(db, from, to);
	return expandInstances(events, exceptions, from, to);
}

/** Runs a core edit and writes its rows in one transaction. Core errors become AppError codes. */
function apply(db: Database, ctx: WriteContext, plan: () => EventWrites): EventWrites {
	return db.transaction(() => {
		let writes: EventWrites;
		try {
			writes = plan();
		} catch (e) {
			if (e instanceof EventEditError) throw new AppError(ERROR_CODES[e.reason]);
			throw e;
		}
		for (const row of writes.events) writeRow(db, ctx, "events", row);
		for (const row of writes.exceptions) writeRow(db, ctx, "event_exceptions", row);
		return writes;
	})();
}

function env(ctx: WriteContext) {
	return { now: ctx.now(), newId: () => Bun.randomUUIDv7() };
}

function liveEvent(db: Database, id: string): CalendarEvent {
	const event = getEvent(db, id);
	if (!event || event.deleted_at !== null) throw new AppError("EVENT_NOT_FOUND");
	return event;
}

export function saveNewEvent(db: Database, ctx: WriteContext, fields: EventFields, tzid: string): CalendarEvent {
	const writes = apply(db, ctx, () => createEvent(fields, tzid, env(ctx)));
	return getEvent(db, writes.events[0].id)!;
}

export function editEventOccurrence(
	db: Database,
	ctx: WriteContext,
	input: { eventId: string; originalStart: number; mode: EditMode; changes: Partial<EventFields> },
): void {
	apply(db, ctx, () => {
		const event = liveEvent(db, input.eventId);
		return editOccurrence({ ...input, event, exceptions: liveExceptions(db, event.id), env: env(ctx) });
	});
}

export function deleteEventOccurrence(
	db: Database,
	ctx: WriteContext,
	input: { eventId: string; originalStart: number; mode: EditMode },
): void {
	apply(db, ctx, () => {
		const event = liveEvent(db, input.eventId);
		return deleteOccurrence({ ...input, event, exceptions: liveExceptions(db, event.id), env: env(ctx) });
	});
}
