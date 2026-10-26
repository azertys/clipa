import type { Database } from "bun:sqlite";
import { BrowserView, Utils } from "electrobun/main";
import { exportFileName, reportCsv } from "../../core/export";
import { localDate } from "../../core/time";
import { strings } from "../mainview/strings";
import type { AppInfo, ClipaRPC, UiStart } from "../shared/rpc-schema";
import { getEntry, listEntries, saveEntry } from "./db/entries";
import {
	deleteEventOccurrence,
	editEventOccurrence,
	getEvent,
	listInstances,
	liveExceptions,
	saveNewEvent,
} from "./db/events";
import type { WriteContext } from "./db/repo";
import { loadReport } from "./db/reports";
import { readSettings, writeSettings } from "./db/settings";
import { deleteTag, listTags, saveTag } from "./db/tags";
import { writeNewFile } from "./services/files";
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

				eventsInstances: ({ from, to }) => listInstances(db, from, to),
				eventsGet: ({ id }) => {
					const event = getEvent(db, id);
					if (!event || event.deleted_at !== null) return null;
					return { event, exceptionStarts: liveExceptions(db, id).map((x) => x.original_start) };
				},
				eventsCreate: ({ fields, tzid }) => saveNewEvent(db, ctx, fields, tzid),
				eventsEditOccurrence: (input) => {
					editEventOccurrence(db, ctx, input);
					return true as const;
				},
				eventsDeleteOccurrence: (input) => {
					deleteEventOccurrence(db, ctx, input);
					return true as const;
				},

				reportsGet: (query) => loadReport(db, query, ctx.now()),
				reportsExportCsv: ({ table, ...query }) => {
					const report = loadReport(db, query, ctx.now());
					const tagNames = new Map(listTags(db).map((t) => [t.id, t.name]));
					const content = reportCsv(report, table, {
						tagName: (id) => tagNames.get(id) ?? id,
						untagged: strings.tags.untagged,
					});
					const name = exportFileName(table, localDate(query.from, query.tzid), localDate(query.to - 1, query.tzid));
					const path = writeNewFile(Utils.paths.downloads, name, content);
					Utils.showItemInFolder(path);
					return { path };
				},
			},
			messages: {},
		},
	});
}

export type ClipaBunRpc = ReturnType<typeof createRpc>;
