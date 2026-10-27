// Typed RPC contract between the webview and the main process.
// Types only: this module emits no runtime code.
// Names are camelCase versions of the spec's dotted names (docs/decisions.md, D2).
import type { RPCSchema } from "electrobun/view";
import type { ImportSummary } from "../../core/backup";
import type { Combo } from "../../core/entries";
import type { ReportTable } from "../../core/export";
import type { Report, TitleTime } from "../../core/reports";
import type { WeekStart } from "../../core/time";
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
	/** Calendar: show tracked time next to the events. */
	showTrackedTime: boolean;
	/** Tray: show the elapsed time next to the icon. */
	showTrayTimer: boolean;
	weekStart: WeekStart;
	hour12: boolean;
	/** Timers shorter than 1 minute are not saved. */
	discardShort: boolean;
	/** Minutes without input before Clipa asks about idle time; 0 = off. */
	idleMinutes: number;
	/** Record window titles too (needs Accessibility permission). Off by default. */
	recordTitles: boolean;
	/** Bundle ids whose window titles are never recorded. */
	noTitleApps: string[];
	/** Bundle ids recorded as "Excluded". */
	excludedApps: string[];
	/** Days to keep app activity; 0 = forever. */
	activityDays: ActivityDays;
	/** Copy the database once a day (spec section 9). */
	autoBackup: boolean;
	/** Folder for the database copies; null = <userData>/backups. */
	backupFolder: string | null;
	/** The JSON export includes apps and activity. */
	exportAppData: boolean;
};

/** Days to keep app activity; 0 = forever. */
export type ActivityDays = 30 | 90 | 365 | 0;

export type Screen = "today" | "entries" | "calendar" | "reports" | "settings";

/** Where the main process asks the view to go (tray, recovery dialog). */
export type Navigation = { screen: Screen; entryId?: string };

export type TimerInput = { note: string; tagIds: string[] };

/** Shown once after a crash closed the running entry at its last heartbeat. */
export type RecoveryNotice = { entry: EntryWithTags; endedAt: number };

/** An event for the dialog, with the original starts of its live exceptions. */
export type EventDetail = { event: CalendarEvent; exceptionStarts: number[] };

export type OccurrenceRef = { eventId: string; originalStart: number; mode: EditMode };

/** A report for [from, to). tzid is the device zone, for the per-day split. */
export type ReportQuery = { from: number; to: number; tzid: string; includeAllDay: boolean };

/** Time in one app, with its window titles when they were recorded. */
export type AppUsage = { name: string; ms: number; titles: TitleTime[] };

/** An idle period that ended: the view asks Keep / Discard / Discard and stop. */
export type IdlePrompt = { id: string; entryId: string; start: number; end: number };

export type IdleAction = "keep" | "discard" | "discardStop";

/** Accessibility permission (window titles) and launch at login, for Settings. */
export type TrackingStatus = { nativeLoaded: boolean; titlePermission: boolean; launchAtLogin: LaunchAtLogin };

export type LaunchAtLogin = "on" | "off" | "approval" | "unavailable";

/** The automatic backup folder and the time of the newest daily copy. */
export type BackupStatus = { folder: string; lastAt: number | null };

/** Entries for the CSV export: a range (with only `ids` when given), or all entries when null. */
export type EntriesExport = { tzid: string; range: { from: number; to: number } | null; ids?: string[] };

/** "unavailable": a dev build, or no update host in this build. */
export type UpdateCheck =
	| { state: "current" | "unavailable"; version: string }
	| { state: "available"; version: string; latest: string }
	| { state: "error"; version: string; message: string };

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
			/** Deletes the running entry and stops the timer. */
			timerDiscard: { params: {}; response: true };
			/** The latest distinct note + tag combinations, as in the tray's Continue menu. */
			timerRecent: { params: { limit: number }; response: Combo[] };
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
			/** Shows the database file in the file manager. */
			revealDatabase: { params: {}; response: true };

			eventsInstances: { params: { from: number; to: number }; response: Instance[] };
			eventsGet: { params: { id: string }; response: EventDetail | null };
			/** The spec's events.upsert is split into create and editOccurrence (D21). */
			eventsCreate: { params: { fields: EventFields; tzid: string }; response: CalendarEvent };
			eventsEditOccurrence: { params: OccurrenceRef & { changes: Partial<EventFields> }; response: true };
			eventsDeleteOccurrence: { params: OccurrenceRef; response: true };

			/** The idle question waiting for an answer, for the idle window (D54). */
			idleQuestion: { params: {}; response: IdlePrompt | null };
			idleResolve: { params: { id: string; action: IdleAction }; response: true };
			trackingStatus: { params: {}; response: TrackingStatus };
			/** Shows the macOS Accessibility prompt. Returns whether permission is granted now. */
			trackingRequestPermission: { params: {}; response: boolean };
			/** Opens System Settings at Privacy & Security → Accessibility. */
			trackingOpenSettings: { params: {}; response: true };
			launchAtLoginSet: { params: { on: boolean }; response: LaunchAtLogin };
			/** Apps seen by the sampler, for the "Do not record" lists. */
			appsList: { params: {}; response: { key: string; name: string }[] };
			/** Time per app of the running entry, with the open segment. */
			timerApps: { params: {}; response: AppUsage[] };

			reportsGet: { params: ReportQuery; response: Report };
			/** Writes report tables as CSV files to Downloads and shows them in the file manager (D31). */
			reportsExportCsv: { params: ReportQuery & { tables: ReportTable[] }; response: { paths: string[] } };

			/** Writes the JSON backup (spec section 9) to Downloads and shows it in the file manager. */
			backupExport: { params: { tzid: string }; response: { path: string } };
			/** Writes entries as CSV to Downloads and shows the file in the file manager. */
			entriesExportCsv: { params: EntriesExport; response: { path: string } };
			/** Copies the database, then merges a JSON backup's text into it. */
			backupImport: { params: { json: string }; response: ImportSummary };
			backupStatus: { params: {}; response: BackupStatus };
			/** Asks for the backup folder. Returns the new settings, or null when cancelled. */
			backupChooseFolder: { params: {}; response: Settings | null };
			/** The only network call: made when the user clicks "Check for updates" (open question 5). */
			updateCheck: { params: {}; response: UpdateCheck };
			/** Downloads the update, then restarts Clipa. A running timer continues after the restart. */
			updateInstall: { params: {}; response: true };
		};
		messages: {
			/** Alt+F4 on Windows, Ctrl+Q on Linux. Quits as the tray's Quit does. */
			appQuit: {};
			/** Ctrl+W on Windows and Linux, and the idle window after an answer. Closes the window. */
			windowClose: {};
			/** A right click in a text field: Cut / Copy / Paste at the pointer. */
			editMenuShow: {};
		};
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
			/** The update download or restart failed. */
			updateFailed: { message: string };
		};
	}>;
};
