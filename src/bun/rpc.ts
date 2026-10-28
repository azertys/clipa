import type { Database } from "bun:sqlite";
import { BrowserView, ContextMenu, Updater, Utils, type ApplicationMenuItemConfig } from "electrobun/main";
import { existsSync } from "node:fs";
import { backupFileName } from "../../core/backup";
import { recentCombos } from "../../core/entries";
import { entriesCsv, exportFileName, reportCsv } from "../../core/export";
import { localDate } from "../../core/time";
import { strings } from "../mainview/strings";
import type { AppInfo, ClipaRPC, UiStart, UpdateCheck } from "../shared/rpc-schema";
import { listAppsByName } from "./db/activity";
import { exportBackup, importBackup, parseBackupFile } from "./db/backup";
import { getEntry, listEntries, recentEntries, saveEntry } from "./db/entries";
import {
	deleteEventOccurrence,
	editEventOccurrence,
	getEvent,
	listInstances,
	liveExceptions,
	saveNewEvent,
} from "./db/events";
import { AppError, type WriteContext } from "./db/repo";
import { loadReport } from "./db/reports";
import { forgetSettings, readSettings, writeSettings } from "./db/settings";
import { deleteTag, listTags, saveTag } from "./db/tags";
import type { NativeSystem, NativeTracker } from "./native/tracker";
import type { Backups } from "./services/backups";
import { writeNewFile } from "./services/files";
import { EXCLUDED_KEY } from "./services/sampler";
import type { TimerService } from "./services/timer";
import type { Tracking } from "./services/tracking";

/** Replaces the webview's own context menu, which has Inspect Element. */
const EDIT_MENU: ApplicationMenuItemConfig[] = [
	{ role: "cut" },
	{ role: "copy" },
	{ role: "paste" },
	{ type: "separator" },
	{ role: "selectAll" },
];

/** The view gives up on a request after 10 s; the update check must answer before that. */
const UPDATE_CHECK_MS = 9_000;

/** System Settings → Privacy & Security → Accessibility. */
const ACCESSIBILITY_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export type AppContext = {
	db: Database;
	ctx: WriteContext;
	timer: TimerService;
	tracking: Tracking;
	tracker: NativeTracker;
	system: NativeSystem;
	backups: Backups;
	info: AppInfo;
	/** Returns and clears what the view must show when it is ready. */
	takeUiStart(): UiStart;
	/** Keeps the view's draft note and tags for the next start. */
	setDraft(draft: { note: string; tagIds: string[] }): void;
	/** Entries or tags changed from the view. The tray menu reloads. */
	onDataChanged(): void;
	/** Downloads the update in the background and restarts into it. */
	installUpdate(): void;
	/** Closes this window. Clipa stays in the tray. */
	closeWindow(): void;
};

export function createRpc(app: AppContext) {
	const { db, ctx, timer, tracking, tracker, system, backups } = app;
	const changed = <T>(value: T): T => {
		app.onDataChanged();
		return value;
	};
	/** Today's database copy; a failure shows as `code` in the view. */
	const dailyBackup = (code: string) => {
		try {
			backups.daily();
		} catch (error) {
			console.error("[clipa] backup failed:", error);
			throw new AppError(code);
		}
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
				settingsSet: (patch) => {
					const settings = writeSettings(db, patch);
					// Turning automatic backup on makes today's copy now. If it fails, it stays off.
					if (patch.autoBackup) {
						try {
							dailyBackup("BACKUP_FAILED");
						} catch (error) {
							writeSettings(db, { autoBackup: false });
							throw error;
						}
					}
					return changed(settings);
				},
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

				idleQuestion: () => tracking.idle.question(),
				idleResolve: ({ id, action }) => {
					tracking.resolve(id, action);
					return changed(true as const);
				},
				trackingStatus: () => ({
					nativeLoaded: app.info.nativeLoaded,
					titlePermission: tracker.hasTitlePermission(),
					launchAtLogin: system.launchAtLogin(),
					// Settings is open, so Clipa is the active app when it can be read.
					seesApps: tracker.frontmostApp() !== null,
					measuresIdle: tracker.measuresIdle(),
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

				backupExport: ({ tzid }) => {
					const backup = exportBackup(db, ctx, readSettings(db).exportAppData);
					const name = backupFileName(localDate(ctx.now(), tzid));
					const path = writeNewFile(Utils.paths.downloads, name, JSON.stringify(backup));
					Utils.showItemInFolder(path);
					return { path };
				},
				entriesExportCsv: ({ tzid, range, ids }) => {
					const now = ctx.now();
					const keep = ids ? new Set(ids) : null;
					const entries = listEntries(db, range?.from ?? 0, range?.to ?? Number.MAX_SAFE_INTEGER)
						.filter((e) => !keep || keep.has(e.id))
						.reverse();
					const tagNames = new Map(listTags(db).map((t) => [t.id, t.name]));
					const text = entriesCsv(entries, { tzid, now, tagName: (id) => tagNames.get(id) ?? id });
					// The range's days, or for all entries the days of the first and the last.
					const first = range?.from ?? entries[0]?.started_at ?? now;
					const last = range ? range.to - 1 : (entries.at(-1)?.started_at ?? now);
					const name = exportFileName("entries", localDate(first, tzid), localDate(last, tzid));
					const path = writeNewFile(Utils.paths.downloads, name, text);
					Utils.showItemInFolder(path);
					return { path };
				},
				backupImport: ({ json }) => {
					const backup = parseBackupFile(json);
					// No import without the copy.
					let copy: string;
					try {
						copy = backups.beforeImport();
					} catch (error) {
						console.error("[clipa] copy before import failed:", error);
						throw new AppError("BACKUP_FAILED");
					}
					const summary = importBackup(db, ctx, backup, copy);
					console.log(
						`[clipa] import: ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped, copy at ${summary.backupPath}`,
					);
					// Tags may have changed, and the running entry with them.
					forgetSettings(db);
					timer.resync();
					return changed(summary);
				},
				backupStatus: () => backups.status(),
				backupChooseFolder: async () => {
					const [folder] = await Utils.openFileDialog({
						startingFolder: existsSync(backups.folder()) ? backups.folder() : "~/",
						canChooseFiles: false,
						canChooseDirectory: true,
						allowsMultipleSelection: false,
					});
					// The dialog blocked this process; that time is not sleep.
					tracking.sampler.resume();
					if (!folder) return null;
					const previous = readSettings(db).backupFolder;
					writeSettings(db, { backupFolder: folder });
					try {
						dailyBackup("BACKUP_FOLDER_FAILED");
					} catch (error) {
						writeSettings(db, { backupFolder: previous });
						throw error;
					}
					return readSettings(db);
				},
				updateCheck: async (): Promise<UpdateCheck> => {
					const local = await Updater.getLocalInfo();
					if (local.channel === "dev" || !local.baseUrl) return { state: "unavailable", version: local.version };
					const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), UPDATE_CHECK_MS));
					const info = await Promise.race([Updater.checkForUpdate(), timeout]);
					if (!info) return { state: "error", version: local.version, message: "timeout" };
					if (info.error) return { state: "error", version: local.version, message: info.error };
					return info.updateAvailable
						? { state: "available", version: local.version, latest: info.version }
						: { state: "current", version: local.version };
				},
				updateInstall: () => {
					app.installUpdate();
					return true as const;
				},
			},
			messages: {
				appQuit: () => Utils.quit(),
				windowClose: () => app.closeWindow(),
				editMenuShow: () => ContextMenu.showContextMenu(EDIT_MENU),
			},
		},
	});
}

export type ClipaBunRpc = ReturnType<typeof createRpc>;
