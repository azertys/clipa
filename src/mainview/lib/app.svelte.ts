// Shared view state: the running entry, tags, settings, the clock and navigation.
import { formatClock } from "../../../core/time";
import type { EntryWithTags, Tag } from "../../../core/types";
import type { IdlePrompt, Navigation, RecoveryNotice, Screen, Settings } from "../../shared/rpc-schema";
import { errorText, strings } from "../strings";
import { api, onMessage } from "./rpc";

export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SAVE_DELAY_MS = 600;

class AppState {
	screen = $state<Screen>("today");
	/** Entry to open in the Entries side panel; "new" opens an empty one. */
	panelEntryId = $state<string | null>(null);
	running = $state<EntryWithTags | null>(null);
	tags = $state<Tag[]>([]);
	settings = $state<Settings>({
		defaultTagIds: [],
		showTrackedTime: true,
		showTrayTimer: true,
		weekStart: 1,
		hour12: false,
		discardShort: false,
		idleMinutes: 5,
		recordTitles: false,
		noTitleApps: [],
		excludedApps: [],
		activityDays: 90,
	});
	/** Updated every second, for elapsed time. */
	now = $state(Date.now());
	/** Bumped when entries change. Screens reload when it changes. */
	revision = $state(0);
	error = $state<string | null>(null);
	/** Set when the main process closed a running entry after a crash. */
	recovery = $state<RecoveryNotice | null>(null);
	/** An idle period waiting for Keep / Discard / Discard and stop. */
	idle = $state<IdlePrompt | null>(null);

	/** The timer's note and tags: the running entry's while it runs, the next entry's while stopped. */
	note = $state("");
	tagIds = $state<string[]>([]);

	tagById = $derived(new Map(this.tags.map((t) => [t.id, t])));

	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	async load() {
		const [running, tags, settings] = await Promise.all([api.timerStatus({}), api.tagsList({}), api.settingsGet({})]);
		this.tags = tags;
		this.settings = settings;
		this.setRunning(running, true);
	}

	async reloadTags() {
		const [tags, settings] = await Promise.all([api.tagsList({}), api.settingsGet({})]);
		this.tags = tags;
		this.settings = settings;
	}

	/** Takes a new running entry. The note and tags follow when the entry changes. */
	setRunning(entry: EntryWithTags | null, force = false) {
		const changed = force || entry?.id !== this.running?.id;
		this.running = entry;
		if (!changed) return;
		this.cancelSave();
		this.note = entry?.note ?? "";
		this.tagIds = entry ? [...entry.tagIds] : [...this.settings.defaultTagIds];
	}

	/**
	 * Edits the note or tags. While the timer runs, the running entry is saved after a
	 * short delay. While stopped, the main process keeps them so a tray start uses them too.
	 */
	editTimer(fields: { note?: string; tagIds?: string[] }) {
		if (fields.note !== undefined) this.note = fields.note;
		if (fields.tagIds !== undefined) this.tagIds = fields.tagIds;
		this.cancelSave();
		this.saveTimeout = setTimeout(() => {
			if (this.running) void this.saveRunning();
			else void api.timerDraft({ note: this.note, tagIds: this.tagIds });
		}, SAVE_DELAY_MS);
	}

	async toggleTimer() {
		if (this.running) {
			await this.saveRunning();
			const stopped = await this.attempt(() => api.timerStop({}));
			if (stopped !== undefined) this.setRunning(null);
		} else {
			const entry = await this.attempt(() => api.timerStart({ note: this.note, tagIds: this.tagIds }));
			if (entry) this.setRunning(entry);
		}
		this.revision++;
	}

	/** Starts a new entry with this note and tags. A running entry stops first. */
	async continueWith(combo: { note: string; tagIds: string[] }) {
		if (this.running) {
			await this.saveRunning();
			if ((await this.attempt(() => api.timerStop({}))) === undefined) return;
			this.setRunning(null);
		}
		const entry = await this.attempt(() => api.timerStart({ note: combo.note, tagIds: combo.tagIds }));
		if (entry) this.setRunning(entry);
		this.revision++;
	}

	/** Deletes the running entry and stops the timer. */
	async discardTimer() {
		this.cancelSave();
		if (await this.attempt(() => api.timerDiscard({}))) this.setRunning(null);
		this.revision++;
	}

	/** Moves the start of the running entry. */
	async setStartedAt(ms: number) {
		const running = this.running;
		if (!running) return;
		this.cancelSave();
		const saved = await this.attempt(() =>
			api.entriesUpsert({ ...running, started_at: ms, note: this.note, tagIds: this.tagIds }),
		);
		if (saved && this.running?.id === saved.id) this.running = saved;
		this.revision++;
	}

	private async saveRunning() {
		this.cancelSave();
		const running = this.running;
		if (!running) return;
		if (running.note === this.note && sameIds(running.tagIds, this.tagIds)) return;
		const saved = await this.attempt(() =>
			api.entriesUpsert({ ...running, note: this.note, tagIds: this.tagIds }),
		);
		if (saved && this.running?.id === saved.id) this.running = saved;
		this.revision++;
	}

	private cancelSave() {
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = null;
	}

	navigate(nav: Navigation) {
		this.screen = nav.screen;
		if (nav.entryId) this.panelEntryId = nav.entryId;
	}

	/** Runs an action and shows its error, if any. Returns undefined on error. */
	async attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
		try {
			this.error = null;
			return await action();
		} catch (e) {
			this.error = errorText(e);
			return undefined;
		}
	}
}

function sameIds(a: string[], b: string[]) {
	return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export const app = new AppState();

/** A local clock time in the user's time format. */
export const clock = (ms: number) => formatClock(ms, tz, app.settings.hour12);

/** "08:30–10:05". An open end shows "now". */
export const clockRange = (start: number, end: number | null) =>
	`${clock(start)}–${end === null ? strings.common.now : clock(end)}`;

/** A tag's color, or the accent for a tag without one. */
export const tagColor = (tag: Pick<Tag, "color"> | undefined) => tag?.color ?? "var(--clipa-accent)";

onMessage("timerChanged", ({ entry }) => app.setRunning(entry));
onMessage("dataChanged", () => {
	app.revision++;
	void app.reloadTags();
});
onMessage("navigate", (nav) => app.navigate(nav));
onMessage("idleDetected", (prompt) => (app.idle = prompt));

setInterval(() => (app.now = Date.now()), 1000);
