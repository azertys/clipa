// The event dialog's repeat options and their RRULE strings (RFC 5545).
// String work only: the view uses this module and does not need the rrule package.
import { Temporal } from "./temporal";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** ISO order: Monday first. Index + 1 = Temporal dayOfWeek. */
export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const WORKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR"];

export type RepeatFreq = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";

export type RepeatEnd = { kind: "never" } | { kind: "until"; date: string } | { kind: "count"; count: number };

/** The dialog state. `raw` keeps a rule the dialog cannot show (freq "custom"). */
export type Repeat = {
	freq: RepeatFreq;
	interval: number;
	days: Weekday[];
	end: RepeatEnd;
	raw?: string;
};

export const NO_REPEAT: Repeat = { freq: "none", interval: 1, days: [], end: { kind: "never" } };

/** Splits an RRULE body (FREQ=WEEKLY;BYDAY=MO) into upper-case parts. Accepts an "RRULE:" prefix. */
export function ruleParts(rrule: string): Map<string, string> {
	const parts = new Map<string, string>();
	for (const part of rrule.trim().replace(/^RRULE:/i, "").split(";")) {
		if (part === "") continue;
		const eq = part.indexOf("=");
		if (eq <= 0) throw new Error(`invalid RRULE part: ${part}`);
		parts.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).toUpperCase());
	}
	return parts;
}

/** Joins parts into an RRULE body. FREQ comes first. */
export function formatRule(parts: Map<string, string>): string {
	const keys = [...parts.keys()].sort((a, b) => (a === "FREQ" ? -1 : b === "FREQ" ? 1 : 0));
	return keys.map((k) => `${k}=${parts.get(k)}`).join(";");
}

/** UTC ms as an RRULE UTC date-time: 20261231T215959Z. Milliseconds are dropped. */
export function formatUntil(ms: number): string {
	return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * The UNTIL value as UTC ms. A UTC value (Z) is an instant. A floating value is wall-clock
 * time in tzid. A date-only value includes that whole local day.
 */
export function parseUntil(value: string, tzid: string): number {
	const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value);
	if (!m) throw new Error(`invalid UNTIL: ${value}`);
	const [, y, mo, d, h, mi, s, z] = m;
	if (h === undefined) {
		const next = Temporal.PlainDate.from({ year: +y, month: +mo, day: +d }).add({ days: 1 });
		return next.toZonedDateTime({ timeZone: tzid }).epochMilliseconds - 1;
	}
	if (z === "Z") return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
	return Temporal.PlainDateTime.from({ year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: +s })
		.toZonedDateTime(tzid, { disambiguation: "compatible" }).epochMilliseconds;
}

const KNOWN_KEYS = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL", "WKST"]);

/** The dialog state for a stored rule. Rules the dialog cannot show become "custom". */
export function repeatFromRule(rrule: string | null, tzid: string): Repeat {
	if (rrule === null) return { ...NO_REPEAT };
	const parts = ruleParts(rrule);
	const interval = Number(parts.get("INTERVAL") ?? "1");
	const days = (parts.get("BYDAY") ?? "").split(",").filter((d) => d !== "") as Weekday[];
	const count = parts.get("COUNT");
	const until = parts.get("UNTIL");
	const end: RepeatEnd =
		count !== undefined
			? { kind: "count", count: Number(count) }
			: until !== undefined
				? {
						kind: "until",
						date: Temporal.Instant.fromEpochMilliseconds(parseUntil(until, tzid))
							.toZonedDateTimeISO(tzid)
							.toPlainDate()
							.toString(),
					}
				: { kind: "never" };
	const custom: Repeat = { freq: "custom", interval, days: [], end, raw: rrule };
	const simpleDays = days.every((d) => WEEKDAYS.includes(d));
	const wkst = parts.get("WKST");
	if ([...parts.keys()].some((k) => !KNOWN_KEYS.has(k)) || !simpleDays || (wkst && wkst !== "MO")) return custom;
	if (!Number.isInteger(interval) || interval < 1) return custom;
	switch (parts.get("FREQ")) {
		case "DAILY":
			return days.length === 0 ? { freq: "daily", interval, days: [], end } : custom;
		case "WEEKLY": {
			const sorted = sortDays(days);
			if (interval === 1 && sorted.join() === WORKDAYS.join()) return { freq: "weekdays", interval, days: [], end };
			return { freq: "weekly", interval, days: sorted, end };
		}
		case "MONTHLY":
			return days.length === 0 ? { freq: "monthly", interval, days: [], end } : custom;
		case "YEARLY":
			return days.length === 0 ? { freq: "yearly", interval, days: [], end } : custom;
		default:
			return custom;
	}
}

/**
 * The RRULE body for the dialog state, or null for no repeat.
 * Weekly without days repeats on the weekday of `start`. An end date includes that local day.
 */
export function ruleFromRepeat(repeat: Repeat, start: number, tzid: string): string | null {
	if (repeat.freq === "none") return null;
	if (repeat.freq === "custom") return repeat.raw ?? null;
	const parts = new Map<string, string>();
	const interval = Math.max(1, Math.floor(repeat.interval));
	switch (repeat.freq) {
		case "daily":
			parts.set("FREQ", "DAILY");
			break;
		case "weekdays":
			parts.set("FREQ", "WEEKLY");
			parts.set("BYDAY", WORKDAYS.join(","));
			break;
		case "weekly": {
			const days = repeat.days.length > 0 ? sortDays(repeat.days) : [weekdayOf(start, tzid)];
			parts.set("FREQ", "WEEKLY");
			parts.set("BYDAY", days.join(","));
			break;
		}
		case "monthly":
			parts.set("FREQ", "MONTHLY");
			break;
		case "yearly":
			parts.set("FREQ", "YEARLY");
			break;
	}
	parts.set("INTERVAL", String(repeat.freq === "weekdays" ? 1 : interval));
	if (repeat.end.kind === "count") parts.set("COUNT", String(Math.max(1, Math.floor(repeat.end.count))));
	if (repeat.end.kind === "until") {
		const next = Temporal.PlainDate.from(repeat.end.date).add({ days: 1 });
		parts.set("UNTIL", formatUntil(next.toZonedDateTime({ timeZone: tzid }).epochMilliseconds - 1000));
	}
	return formatRule(parts);
}

/** The local weekday of an instant. */
export function weekdayOf(ms: number, tzid: string): Weekday {
	return WEEKDAYS[Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tzid).dayOfWeek - 1];
}

export function sortDays(days: Weekday[]): Weekday[] {
	return [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}

/**
 * Moves a rule's weekday and day-of-month parts with the series start, for a move without
 * a rule change (a drag). BYDAY shifts by the day difference. BYMONTHDAY and BYMONTH follow
 * the start when they matched the old start.
 */
export function retargetRule(rrule: string, oldStart: number, newStart: number, tzid: string): string {
	const from = Temporal.Instant.fromEpochMilliseconds(oldStart).toZonedDateTimeISO(tzid).toPlainDate();
	const to = Temporal.Instant.fromEpochMilliseconds(newStart).toZonedDateTimeISO(tzid).toPlainDate();
	const shift = from.until(to, { largestUnit: "days" }).days;
	if (shift === 0) return rrule;
	const parts = ruleParts(rrule);
	const byday = parts.get("BYDAY");
	if (byday) {
		const moved = byday.split(",").map((d) => {
			const m = /^([+-]?\d*)([A-Z]{2})$/.exec(d);
			if (!m) return d;
			const index = WEEKDAYS.indexOf(m[2] as Weekday);
			if (index < 0) return d;
			return m[1] + WEEKDAYS[(((index + shift) % 7) + 7) % 7];
		});
		parts.set("BYDAY", orderDays(moved).join(","));
	}
	if (parts.get("BYMONTHDAY") === String(from.day)) parts.set("BYMONTHDAY", String(to.day));
	if (parts.get("BYMONTH") === String(from.month)) parts.set("BYMONTH", String(to.month));
	return formatRule(parts);
}

/** Plain weekday lists stay in Monday-first order. */
function orderDays(days: string[]): string[] {
	return days.every((d) => WEEKDAYS.includes(d as Weekday)) ? sortDays(days as Weekday[]) : days;
}
