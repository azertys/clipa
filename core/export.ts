// CSV export (spec sections 7 and 9). RFC 4180: comma separated, CRLF line ends, fields with a
// comma, quote or line break in double quotes. A UTF-8 byte order mark lets Excel read non-ASCII text.
import type { Report } from "./reports";
import { formatDuration, isoLocal, localDate } from "./time";
import type { EntryWithTags } from "./types";

const BOM = "﻿";

export function csvField(value: string | number | boolean, quote = false): string {
	const text = String(value);
	return quote || /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV table. Columns named in `quoted` are always in double quotes (not the header). */
export function csv(header: string[], rows: (string | number | boolean)[][], quoted: string[] = []): string {
	const always = header.map((h) => quoted.includes(h));
	const lines = [header.map((h) => csvField(h)), ...rows.map((row) => row.map((v, i) => csvField(v, always[i])))];
	return BOM + lines.map((fields) => fields.join(",")).join("\r\n") + "\r\n";
}

/** Hours with two decimals, for spreadsheets: 1:30 → "1.50". */
export function hours(ms: number): string {
	return (ms / 3_600_000).toFixed(2);
}

/** Coverage 0..1 as a percentage with one decimal, without the % sign. */
function percent(ratio: number): string {
	return (ratio * 100).toFixed(1);
}

export type ReportTable = "days" | "events" | "tags" | "apps";

/**
 * One table of a report as CSV. Times are local ISO 8601 with the offset.
 * tagName and untagged name the tags; apps carry their names in the report.
 */
export function reportCsv(
	report: Report,
	table: ReportTable,
	names: { tagName: (id: string) => string; untagged: string },
): string {
	const tz = report.range.tzid;
	switch (table) {
		case "days":
			return csv(
				["date", "tracked_hm", "tracked_hours", "planned_hm", "planned_hours", "covered_hm", "covered_hours"],
				report.days.map((d) => [
					d.date,
					formatDuration(d.trackedMs),
					hours(d.trackedMs),
					formatDuration(d.plannedMs),
					hours(d.plannedMs),
					formatDuration(d.coveredMs),
					hours(d.coveredMs),
				]),
			);
		case "events":
			return csv(
				[
					"start",
					"end",
					"title",
					"planned_hm",
					"planned_hours",
					"tracked_hm",
					"tracked_hours",
					"coverage_percent",
					"partial",
				],
				report.events.map((e) => [
					isoLocal(e.start, tz),
					isoLocal(e.end, tz),
					e.title,
					formatDuration(e.plannedMs),
					hours(e.plannedMs),
					formatDuration(e.trackedMs),
					hours(e.trackedMs),
					percent(e.coverage),
					e.partial,
				]),
			);
		case "tags":
			return csv(
				["tag", "duration_hm", "duration_hours"],
				report.tags.map((t) => [
					t.tagId === null ? names.untagged : names.tagName(t.tagId),
					formatDuration(t.ms),
					hours(t.ms),
				]),
			);
		case "apps":
			return csv(
				["app", "duration_hm", "duration_hours"],
				report.apps.map((a) => [a.name, formatDuration(a.ms), hours(a.ms)]),
			);
	}
}

/**
 * Entries as CSV (spec section 9). Local times with the offset, tags separated by ";", the note
 * always quoted. A running entry has no end and counts up to now.
 */
export function entriesCsv(
	entries: EntryWithTags[],
	opts: { tzid: string; now: number; tagName: (id: string) => string },
): string {
	return csv(
		["date", "start", "end", "duration_hm", "duration_hours", "tags", "note"],
		entries.map((e) => {
			const ms = (e.ended_at ?? opts.now) - e.started_at;
			return [
				localDate(e.started_at, opts.tzid),
				isoLocal(e.started_at, opts.tzid),
				e.ended_at === null ? "" : isoLocal(e.ended_at, opts.tzid),
				formatDuration(ms),
				hours(ms),
				e.tagIds.map(opts.tagName).join(";"),
				e.note,
			];
		}),
		["note"],
	);
}

/** A file name for an export: clipa-events-2026-10-01_2026-10-31.csv (both dates included). */
export function exportFileName(kind: string, fromDate: string, toDate: string): string {
	return fromDate === toDate ? `clipa-${kind}-${fromDate}.csv` : `clipa-${kind}-${fromDate}_${toDate}.csv`;
}
