import type { Database } from "bun:sqlite";
import { buildReport, type ActivityRow, type AppRow, type Report } from "../../../core/reports";
import type { ReportQuery } from "../../shared/rpc-schema";
import { listEntries } from "./entries";
import { eventsForRange } from "./events";
import { AppError } from "./repo";

/** Activity of live entries that touches [from, to). The sampler (M4) writes it. */
export function listActivity(db: Database, from: number, to: number): ActivityRow[] {
	return db
		.query(
			`SELECT a.app_id, a.started_at, a.ended_at FROM activity a
			 JOIN time_entries e ON e.id = a.entry_id
			 WHERE e.deleted_at IS NULL AND a.started_at < ? AND a.ended_at > ?`,
		)
		.all(to, from) as ActivityRow[];
}

export function listApps(db: Database): AppRow[] {
	return db.query("SELECT id, display_name FROM apps").all() as AppRow[];
}

/** Loads what the report needs and builds it. A running entry counts up to now. */
export function loadReport(db: Database, query: ReportQuery, now: number): Report {
	const { from, to, tzid, includeAllDay } = query;
	if (!(from < to)) throw new AppError("REPORT_RANGE_INVALID");
	const { events, exceptions } = eventsForRange(db, from, to);
	return buildReport({
		from,
		to,
		tzid,
		now,
		entries: listEntries(db, from, to),
		events,
		exceptions,
		activity: listActivity(db, from, to),
		apps: listApps(db),
		includeAllDay,
	});
}
