// Event expansion. The calendar and the reports both use expandInstances().
import type { CalendarEvent, EventException, Instance } from "./types";

/** True when the half-open intervals [aStart, aEnd) and [bStart, bEnd) share time. */
export function touches(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

export function expandInstances(
	events: CalendarEvent[],
	_exceptions: EventException[],
	from: number,
	to: number,
): Instance[] {
	const out: Instance[] = [];
	for (const event of events) {
		if (event.deleted_at !== null) continue;
		if (event.rrule !== null) {
			throw new Error("expandInstances: recurring events arrive in M2");
		}
		const start = event.starts_at;
		const end = start + event.duration_ms;
		if (!touches(start, end, from, to)) continue;
		out.push({
			eventId: event.id,
			originalStart: start,
			start,
			end,
			title: event.title,
			allDay: event.all_day === 1,
			isException: false,
		});
	}
	return out.sort((a, b) => a.start - b.start);
}
