import type { Database } from "bun:sqlite";
import { BrowserView } from "electrobun/main";
import { expandInstances } from "../../core/recurrence";
import type { AppInfo, ClipaRPC, UiStart } from "../shared/rpc-schema";
import { getEntry, listEntries, saveEntry } from "./db/entries";
import type { WriteContext } from "./db/repo";
import { readSettings, writeSettings } from "./db/settings";
import { deleteTag, listTags, saveTag } from "./db/tags";
import type { TimerService } from "./services/timer";

export type AppContext = {
	db: Database;
	ctx: WriteContext;
	timer: TimerService;
	info: AppInfo;
	/** Returns and clears what the view must show when it is ready. */
	takeUiStart(): UiStart;
	/** Keeps the view's draft note and tags for the next start. */
	setDraft(draft: { note: string; tagIds: string[] }): void;
	/** Entries or tags changed from the view. The tray menu reloads. */
	onDataChanged(): void;
};

export function createRpc(app: AppContext) {
	const { db, ctx, timer } = app;
	const changed = <T>(value: T): T => {
		app.onDataChanged();
		return value;
	};

	return BrowserView.defineRPC<ClipaRPC>({
		maxRequestTime: 10_000,
		handlers: {
			requests: {
				appInfo: () => app.info,
				uiReady: () => app.takeUiStart(),

				timerStart: (input) => timer.start(input),
				timerStop: () => timer.stop(),
				timerStatus: () => timer.status(),
				timerDraft: (draft) => {
					app.setDraft(draft);
					return true as const;
				},

				entriesList: ({ from, to }) => listEntries(db, from, to),
				entriesGet: ({ id }) => {
					const entry = getEntry(db, id);
					return entry?.deleted_at === null ? entry : null;
				},
				entriesUpsert: (input) => changed(saveEntry(db, ctx, input)),
				entriesDelete: ({ id }) => {
					timer.deleteEntry(id);
					return changed(true as const);
				},

				tagsList: () => listTags(db),
				tagsUpsert: (input) => changed(saveTag(db, ctx, input)),
				tagsDelete: ({ id }) => {
					deleteTag(db, ctx, id);
					return changed(true as const);
				},

				settingsGet: () => readSettings(db),
				settingsSet: (patch) => writeSettings(db, patch),

				// The calendar arrives in M2. No events are stored yet.
				eventsInstances: ({ from, to }) => expandInstances([], [], from, to),
			},
			messages: {},
		},
	});
}

export type ClipaBunRpc = ReturnType<typeof createRpc>;
