// Date labels for the view: "Monday, 26 October", "Mon 19", "20 – 26 Oct".
// The UI is English only (open question 1), so names come from Intl in English.
import { Temporal } from "../../../core/temporal";
import { strings } from "../strings";

type PlainDate = ReturnType<typeof Temporal.PlainDate.from>;

const name = (d: PlainDate, part: "weekday" | "month", width: "long" | "short") =>
	d.toLocaleString("en", { [part]: width });

/** "Monday, 26 October" */
export function longDay(date: string): string {
	const d = Temporal.PlainDate.from(date);
	return strings.dates.long(name(d, "weekday", "long"), d.day, name(d, "month", "long"));
}

/** "Mon 19" */
export function shortDay(date: string): string {
	const d = Temporal.PlainDate.from(date);
	return strings.dates.short(name(d, "weekday", "short"), d.day);
}

/** "20 – 26 Oct", or "28 Sep – 4 Oct" across months. With year: "19 – 25 October 2026". */
export function dateRangeLabel(first: string, last: string, month: "long" | "short", year = false): string {
	const a = Temporal.PlainDate.from(first);
	const b = Temporal.PlainDate.from(last);
	const end = strings.dates.dayMonth(b.day, name(b, "month", month)) + (year ? ` ${b.year}` : "");
	if (a.equals(b)) return end;
	const start =
		a.month === b.month && a.year === b.year
			? String(a.day)
			: strings.dates.dayMonth(a.day, name(a, "month", month)) + (year && a.year !== b.year ? ` ${a.year}` : "");
	return strings.dates.range(start, end);
}
