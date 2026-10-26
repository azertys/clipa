// Typed RPC contract between the webview and the main process.
// Types only: this module emits no runtime code.
// Names are camelCase versions of the spec's dotted names (docs/decisions.md, D2).
import type { RPCSchema } from "electrobun/view";
import type {
	CalendarEvent,
	EditMode,
	EntryInput,
	EntryWithTags,
	EventFields,
	Instance,
	Tag,
	TagInput,
} from "../../core/types";

export type AppInfo = {
	version: string;
	deviceId: string;
	dbPath: string;
	nativeLoaded: boolean;
};

export type Settings = {
	defaultTagIds: string[];
	/** Calendar: show tracked time as background events. */
	showTrackedTime: boolean;
};

export type Screen = "today" | "entries" | "calendar" | "reports" | "settings";

/** Where the main process asks the view to go (tray, recovery dialog). */
export type Navigation = { screen: Screen; entryId?: string };

export type TimerInput = { note: string; tagIds: string[] };

/** Shown once after a crash closed the running entry at its last heartbeat. */
export type RecoveryNotice = { entry: EntryWithTags; endedAt: number };

/** An event for the dialog, with the original starts of its live exceptions. */
export type EventDetail = { event: CalendarEvent; exceptionStarts: number[] };

export type OccurrenceRef = { eventId: string; originalStart: number; mode: EditMode };

export type UiStart = { navigation: Navigation | null; recovery: RecoveryNotice | null };

export type ClipaRPC = {
	// Handled in the main process, called by the webview.
	bun: RPCSchema<{
		requests: {
			appInfo: { params: {}; response: AppInfo };
			/** The view calls this once after it mounts. Returns what the view must show first. */
			uiReady: { params: {}; response: UiStart };

			timerStart: { params: TimerInput; response: EntryWithTags };
			timerStop: { params: {}; response: EntryWithTags | null };
			timerStatus: { params: {}; response: EntryWithTags | null };
			/** The note and tags typed while stopped. A tray start uses them too. */
			timerDraft: { params: TimerInput; response: true };

			entriesList: { params: { from: number; to: number }; response: EntryWithTags[] };
			entriesGet: { params: { id: string }; response: EntryWithTags | null };
			entriesUpsert: { params: EntryInput; response: EntryWithTags };
			entriesDelete: { params: { id: string }; response: true };

			tagsList: { params: {}; response: Tag[] };
			tagsUpsert: { params: TagInput; response: Tag };
			tagsDelete: { params: { id: string }; response: true };

			settingsGet: { params: {}; response: Settings };
			settingsSet: { params: Partial<Settings>; response: Settings };

			eventsInstances: { params: { from: number; to: number }; response: Instance[] };
			eventsGet: { params: { id: string }; response: EventDetail | null };
			/** The spec's events.upsert is split into create and editOccurrence (D21). */
			eventsCreate: { params: { fields: EventFields; tzid: string }; response: CalendarEvent };
			eventsEditOccurrence: { params: OccurrenceRef & { changes: Partial<EventFields> }; response: true };
			eventsDeleteOccurrence: { params: OccurrenceRef; response: true };
		};
		messages: {};
	}>;
	// Handled in the webview, sent by the main process.
	webview: RPCSchema<{
		requests: {};
		messages: {
			/** After start, stop or a tray action. */
			timerChanged: { entry: EntryWithTags | null };
			/** Data changed outside the view (tray, recovery). The view reloads what it shows. */
			dataChanged: {};
			navigate: Navigation;
		};
	}>;
};
