// Calendar view helpers: dialog targets and the edit-mode question.
import type { EditMode, EventFields, Instance } from "../../../core/types";
import type { EventDetail } from "../../shared/rpc-schema";
import { strings } from "../strings";

/** What the event dialog opens on: a new event for a slot, or an existing instance. */
export type DialogTarget =
	| { kind: "new"; start: number; end: number; allDay: boolean }
	| { kind: "edit"; instance: Instance };

/** The question "this, this and following, or all?" for a repeating event. */
export type ModeRequest = {
	kind: "edit" | "delete";
	allowThis: boolean;
	/** Shown when the user picks that mode. */
	warnings: Partial<Record<EditMode, string>>;
};

export type AskMode = (request: ModeRequest) => Promise<EditMode | null>;

/** Event colors for the dialog, from the design's tag colors. null is the default amber. */
export const EVENT_COLORS = ["#6b9bf5", "#4fbf87", "#b48cf2", "#45b8c4", "#e57ea8", "#f07167", "#a3a3a3"];

/**
 * The mode question for a change to one instance. "This event" cannot change the repeat,
 * all-day or color. The warnings name the single-event changes that the mode drops
 * (core/event-edits.ts: a timing change for "all", every later exception for "following").
 */
export function modeRequest(
	kind: "edit" | "delete",
	detail: EventDetail,
	instance: Instance,
	changes: Partial<EventFields> = {},
): ModeRequest {
	if (kind === "delete") return { kind, allowThis: true, warnings: {} };
	const others = detail.exceptionStarts.filter((s) => s !== instance.originalStart);
	const first = instance.originalStart <= detail.event.starts_at;
	const later = first ? others : others.filter((s) => s > instance.originalStart);
	const timing = changes.start !== undefined || changes.rrule !== undefined || changes.allDay !== undefined;
	return {
		kind,
		allowThis: changes.rrule === undefined && changes.allDay === undefined && changes.color === undefined,
		warnings: {
			all: timing && others.length > 0 ? strings.mode.warnAll : undefined,
			following: later.length > 0 ? strings.mode.warnFollowing : undefined,
		},
	};
}
