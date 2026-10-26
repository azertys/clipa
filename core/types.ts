// Domain types shared by the main process, the RPC contract and the view.
// All instants are UTC epoch milliseconds. All ids are UUIDv7 strings.

export type Interval = { start: number; end: number };

export type SyncColumns = {
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	device_id: string;
};

export type Tag = SyncColumns & {
	id: string;
	name: string;
	color: string | null;
};

export type TimeEntry = SyncColumns & {
	id: string;
	started_at: number;
	ended_at: number | null; // null = timer is running
	note: string;
};

/** A time entry with its live tag ids, as the view sees it. */
export type EntryWithTags = TimeEntry & { tagIds: string[] };

export type CalendarEvent = SyncColumns & {
	id: string;
	title: string;
	notes: string;
	color: string | null;
	starts_at: number; // first occurrence
	duration_ms: number;
	all_day: number; // 0 | 1
	tzid: string; // IANA zone
	rrule: string | null; // RFC 5545 RRULE body, null = one-off
};

export type EventException = SyncColumns & {
	id: string;
	event_id: string;
	original_start: number;
	kind: "cancelled" | "modified";
	new_starts_at: number | null;
	new_duration_ms: number | null;
	new_title: string | null;
	new_notes: string | null;
};

export type Instance = {
	eventId: string;
	originalStart: number; // UTC ms of the generated occurrence
	start: number; // UTC ms after exceptions
	end: number;
	title: string;
	allDay: boolean;
	isException: boolean;
};

/** Create (no id) or update (id) an entry. ended_at null only for the running entry. */
export type EntryInput = {
	id?: string;
	started_at: number;
	ended_at: number | null;
	note: string;
	tagIds: string[];
};

export type TagInput = { id?: string; name: string; color?: string | null };
