import type { Database } from "bun:sqlite";
import { BrowserView, Utils } from "electrobun/main";
import { recentCombos } from "../../core/entries";
import { exportFileName, reportCsv } from "../../core/export";
import { localDate } from "../../core/time";
import { strings } from "../mainview/strings";
import type { AppInfo, ClipaRPC, UiStart } from "../shared/rpc-schema";
import { listAppsByName } from "./db/activity";
import { getEntry, listEntries, recentEntries, saveEntry } from "./db/entries";
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
import type { NativeSystem, NativeTracker } from "./native/tracker";
import { writeNewFile } from "./services/files";
import { EXCLUDED_KEY } from "./services/sampler";
import type { TimerService } from "./services/timer";
import type { Tracking } from "./services/tracking";

/** System Settings → Privacy & Security → Accessibility. */
const ACCESSIBILITY_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export type AppContext = {
	db: Database;
	ctx: WriteContext;
	timer: TimerService;
	tracking: Tracking;
	tracker: NativeTracker;
	system: NativeSystem;
	info: AppInfo;
	/** Returns and clears what the view must show when it is ready. */
	takeUiStart(): UiStart;
	/** Keeps the view's draft note and tags for the next start. */
	setDraft(draft: { note: string; tagIds: string[] }): void;
	/** Entries or tags changed from the view. The tray menu reloads. */
	onDataChanged(): void;
};

export function createRpc(app: AppContext) {
	const { db, ctx, timer, tracking, tracker, system } = app;
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
				timerDiscard: () => {
					timer.discard();
					return true as const;
				},
				timerRecent: ({ limit }) => recentCombos(recentEntries(db, 200), limit),
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
				// The tray reads the settings (menu bar timer).
				settingsSet: (patch) => changed(writeSettings(db, patch)),
				revealDatabase: () => {
					Utils.showItemInFolder(app.info.dbPath);
					return true as const;
				},

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

				idleResolve: ({ id, action }) => {
					tracking.resolve(id, action);
					return changed(true as const);
				},
				trackingStatus: () => ({
					nativeLoaded: app.info.nativeLoaded,
					titlePermission: tracker.hasTitlePermission(),
					launchAtLogin: system.launchAtLogin(),
				}),
				trackingRequestPermission: () => {
					tracker.requestTitlePermission();
					return tracker.hasTitlePermission();
				},
				trackingOpenSettings: () => {
					Utils.openExternal(ACCESSIBILITY_SETTINGS);
					return true as const;
				},
				launchAtLoginSet: ({ on }) => system.setLaunchAtLogin(on),
				appsList: () =>
					listAppsByName(db)
						.filter((a) => a.platform_key !== EXCLUDED_KEY)
						.map((a) => ({ key: a.platform_key, name: a.display_name })),
				timerApps: () => tracking.sampler.liveAppTimes(),

				reportsGet: (query) => loadReport(db, query, ctx.now()),
				reportsExportCsv: ({ tables, ...query }) => {
					const report = loadReport(db, query, ctx.now());
					const tagNames = new Map(listTags(db).map((t) => [t.id, t.name]));
					const names = { tagName: (id: string) => tagNames.get(id) ?? id, untagged: strings.tags.untagged };
					const from = localDate(query.from, query.tzid);
					const to = localDate(query.to - 1, query.tzid);
					const paths = tables.map((table) =>
						writeNewFile(Utils.paths.downloads, exportFileName(table, from, to), reportCsv(report, table, names)),
					);
					if (paths.length > 0) Utils.showItemInFolder(paths[paths.length - 1]);
					return { paths };
				},
			},
			messages: {},
		},
	});
}

export type ClipaBunRpc = ReturnType<typeof createRpc>;
