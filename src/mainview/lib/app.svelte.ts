// Shared view state: the running entry, tags, settings, the clock and navigation.
import type { EntryWithTags, Tag } from "../../../core/types";
import type { Navigation, RecoveryNotice, Screen, Settings } from "../../shared/rpc-schema";
import { errorText } from "../strings";
import { api, onMessage } from "./rpc";

export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SAVE_DELAY_MS = 600;

class AppState {
	screen = $state<Screen>("today");
	/** Entry to open in the Entries side panel; "new" opens an empty one. */
	panelEntryId = $state<string | null>(null);
	running = $state<EntryWithTags | null>(null);
	tags = $state<Tag[]>([]);
	settings = $state<Settings>({ defaultTagIds: [], showTrackedTime: true });
	/** Updated every second, for elapsed time. */
	now = $state(Date.now());
	/** Bumped when entries change. Screens reload when it changes. */
	revision = $state(0);
	error = $state<string | null>(null);
	/** Set when the main process closed a running entry after a crash. */
	recovery = $state<RecoveryNotice | null>(null);

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

onMessage("timerChanged", ({ entry }) => app.setRunning(entry));
onMessage("dataChanged", () => {
	app.revision++;
	void app.reloadTags();
});
onMessage("navigate", (nav) => app.navigate(nav));

setInterval(() => (app.now = Date.now()), 1000);
