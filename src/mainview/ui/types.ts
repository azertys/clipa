// Row types that screens build for the design components.

/** One day of the per-day chart. */
export type DayBar = {
	/** "Mon 19" for a week, "19" for longer ranges */
	label: string;
	plannedMs: number;
	trackedMs: number;
};

/** One event, or one repeating series, in the report's event table. */
export type EventCoverageRow = {
	key: string;
	title: string;
	color: string | null;
	occurrences: number;
	recurring: boolean;
	plannedMs: number;
	trackedMs: number;
};
