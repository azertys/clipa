// All UI strings, for the view and for the main process (tray, dialogs).
// Keep every user-visible text here so a translation can replace this file.

export const strings = {
	appName: "Clipa",

	nav: {
		today: "Today",
		entries: "Entries",
		calendar: "Calendar",
		reports: "Reports",
		settings: "Settings",
	},

	timer: {
		start: "Start",
		stop: "Stop",
		notePlaceholder: "What are you working on?",
		running: "Running",
		stopped: "Not running",
	},

	tags: {
		placeholder: "Add tags…",
		create: (name: string) => `Create tag “${name}”`,
		remove: (name: string) => `Remove ${name}`,
		none: "No tags",
		untagged: "Untagged",
	},

	today: {
		entriesTitle: "Today's entries",
		total: "Total",
		empty: "No entries today.",
		eventsTitle: "Today's events",
		eventsLater: "Events and coverage arrive with the calendar (M2) and reports (M3).",
	},

	entries: {
		add: "Add entry",
		filterFrom: "From",
		filterTo: "To",
		filterTag: "Tag",
		allTags: "All tags",
		filterText: "Search notes",
		empty: "No entries in this range.",
		overlap: "This entry overlaps another entry. Reports count the shared time once.",
		running: "running",
		noNote: "(no note)",
		dayTotal: "Day total",
	},

	panel: {
		newTitle: "New entry",
		editTitle: "Edit entry",
		start: "Start",
		end: "End",
		note: "Note",
		tags: "Tags",
		save: "Save",
		cancel: "Cancel",
		delete: "Delete",
		confirmDelete: "Delete this entry?",
		runningHint: "This entry is running. Stop the timer to set the end.",
	},

	settings: {
		defaultTags: "Default tags",
		defaultTagsHint: "New timers start with these tags.",
		tagsTitle: "Tags",
		tagsHint: "Deleting a tag removes it from its entries. The entries stay.",
		confirmDeleteTag: (name: string) => `Delete the tag “${name}”? Its entries stay.`,
		rename: "Rename",
		noTags: "No tags yet. Type a name in a tag field and press Enter to create one.",
		later: "Idle detection, tracking, retention, backup, export and launch at login arrive in later milestones.",
	},

	placeholder: {
		calendar: "The calendar arrives in milestone M2.",
		reports: "Reports arrive in milestone M3.",
	},

	tray: {
		start: "Start timer",
		stop: "Stop timer",
		continue: "Continue",
		continueEmpty: "No recent entries",
		openWindow: "Open Clipa",
		quit: "Quit Clipa",
		noNote: "(no note)",
	},

	dialogs: {
		quitTitle: "Stop the timer and quit?",
		quitMessage: "The timer is running.",
		quitStop: "Stop and quit",
		quitKeep: "Quit and keep running",
		cancel: "Cancel",
		recoveryTitle: "The app stopped unexpectedly",
		recoveryMessage: (clock: string) => `The app stopped unexpectedly. The timer was stopped at ${clock}.`,
		recoveryKeep: "Keep",
		recoveryEdit: "Edit",
		recoveryResume: "Resume",
	},

	errors: {
		TIMER_RUNNING: "A timer is already running.",
		TAG_NAME_EMPTY: "Type a tag name.",
		TAG_NAME_TAKEN: "A tag with this name exists.",
		TAG_NOT_FOUND: "This tag no longer exists.",
		ENTRY_END_BEFORE_START: "The end must be after the start.",
		ENTRY_START_IN_FUTURE: "The start cannot be in the future.",
		ENTRY_END_REQUIRED: "Set an end time.",
		ENTRY_IS_RUNNING: "This entry is running. Stop the timer to set the end.",
		ENTRY_NOT_FOUND: "This entry no longer exists.",
		unknown: "Something went wrong.",
	} as Record<string, string>,
};

/** The text for an error from the main process. RPC errors carry a code as the message. */
export function errorText(error: unknown): string {
	const code = error instanceof Error ? error.message : String(error);
	return strings.errors[code] ?? `${strings.errors.unknown} (${code})`;
}
