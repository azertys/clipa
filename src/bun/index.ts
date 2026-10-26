// Clipa main process: database, timer, tray, window and RPC.
import Electrobun, { ApplicationMenu, BrowserWindow, PATHS, Updater, Utils } from "electrobun/main";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Combo } from "../../core/entries";
import type { EntryWithTags } from "../../core/types";
import { strings } from "../mainview/strings";
import type { IdlePrompt, Navigation, RecoveryNotice } from "../shared/rpc-schema";
import { openDatabase } from "./db/database";
import type { WriteContext } from "./db/repo";
import { deviceId, readSettings } from "./db/settings";
import { dylibPath, loadMac } from "./native/macos";
import { nullSystem, nullTracker, type NativeSystem, type NativeTracker } from "./native/tracker";
import { createRpc, type ClipaBunRpc } from "./rpc";
import { Backups, DAILY_CHECK_MS } from "./services/backups";
import { SHORT_ENTRY_MS, TimerService } from "./services/timer";
import { Tracking } from "./services/tracking";
import { ClipaTray } from "./tray";

const DEV_SERVER_URL = "http://localhost:5173";

// --- Data ------------------------------------------------------------------
mkdirSync(Utils.paths.userData, { recursive: true });
const dbPath = join(Utils.paths.userData, "clipa.db");
const db = openDatabase(dbPath);
const ctx: WriteContext = { deviceId: deviceId(db), now: Date.now };
console.log(`[clipa] db=${dbPath}`);

// Database copies (spec section 9): today's at start, then checked every hour while Clipa runs.
const backups = new Backups({
	db,
	now: ctx.now,
	tzid: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
	settings: () => readSettings(db),
	defaultFolder: join(Utils.paths.userData, "backups"),
});

function dailyBackup() {
	try {
		const path = backups.daily();
		if (path) console.log(`[clipa] backup: ${path}`);
	} catch (error) {
		console.error("[clipa] daily backup failed:", error);
	}
}

// --- Native library --------------------------------------------------------
// Without it the timer works and nothing is sampled (nullTracker).
let tracker: NativeTracker = nullTracker;
let system: NativeSystem = nullSystem;
let nativeLoaded = false;
if (process.platform === "darwin") {
	try {
		({ tracker, system } = loadMac(dylibPath(PATHS.RESOURCES_FOLDER)));
		nativeLoaded = true;
	} catch (error) {
		console.error("[clipa] native library failed to load:", error);
	}
}

// --- Timer -----------------------------------------------------------------
let rpc: ClipaBunRpc | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: ClipaTray | null = null;
let pendingNavigation: Navigation | null = null;
let pendingRecovery: RecoveryNotice | null = null;

function send<K extends keyof ClipaBunRpc["send"]>(name: K, payload: Parameters<ClipaBunRpc["send"][K]>[0]) {
	if (!rpc || !mainWindow) return;
	try {
		(rpc.send[name] as (p: typeof payload) => void)(payload);
	} catch (error) {
		console.warn(`[clipa] could not send ${String(name)}:`, error);
	}
}

// The note and tags the view shows while stopped. Window and tray starts both use them.
let draft: { note: string; tagIds: string[] } | null = null;

const timer = new TimerService({
	db,
	ctx,
	minEntryMs: () => (readSettings(db).discardShort ? SHORT_ENTRY_MS : 0),
	onChange: (entry: EntryWithTags | null) => {
		draft = null;
		// The sampler and idle monitor follow the timer. `tracking` exists before any timer change.
		tracking.sync(entry);
		tray?.refresh();
		send("timerChanged", { entry });
		send("dataChanged", {});
	},
});

const tracking = new Tracking({
	db,
	ctx,
	tracker,
	timer,
	settings: () => readSettings(db),
	excludedName: strings.tracking.excluded,
	onPrompt: (prompt: IdlePrompt) => {
		// The question is in the window (a native dialog would block this process, D11).
		if (mainWindow) send("idleDetected", prompt);
		else openMainWindow();
	},
});

function startFromTray() {
	timer.start(draft ?? { note: "", tagIds: readSettings(db).defaultTagIds });
}

// --- Window ----------------------------------------------------------------
async function mainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			return DEV_SERVER_URL;
		} catch {
			// No Vite dev server: use the bundled view.
		}
	}
	return "views://mainview/index.html";
}

const url = await mainViewUrl();

function openMainWindow(navigation?: Navigation) {
	if (mainWindow) {
		mainWindow.show();
		mainWindow.activate();
		if (navigation) send("navigate", navigation);
		return;
	}
	// The view asks for this with uiReady() once it has mounted.
	if (navigation) pendingNavigation = navigation;
	rpc = createRpc({
		db,
		ctx,
		timer,
		tracking,
		tracker,
		system,
		backups,
		info: { version: "0.1.0", deviceId: ctx.deviceId, dbPath, nativeLoaded },
		takeUiStart: () => {
			const start = { navigation: pendingNavigation, recovery: pendingRecovery, idle: tracking.idle.question() };
			console.log(`[clipa] view ready, recovery notice: ${start.recovery ? "yes" : "no"}`);
			pendingNavigation = null;
			pendingRecovery = null;
			return start;
		},
		setDraft: (next) => {
			draft = next;
		},
		onDataChanged: () => tray?.refresh(),
		installUpdate: () => void installUpdate(),
	});
	mainWindow = new BrowserWindow({
		title: strings.appName,
		url,
		rpc,
		frame: { width: 1100, height: 720 },
	});
	mainWindow.on("close", () => {
		mainWindow = null;
		rpc = null;
	});
}

// --- Tray ------------------------------------------------------------------
tray = new ClipaTray(db, timer, {
	toggle: () => (timer.status() ? timer.stop() : startFromTray()),
	continueWith: (combo: Combo) => timer.continueWith(combo),
	openWindow: () => openMainWindow(),
	quit: () => Utils.quit(),
});

// --- Quit ------------------------------------------------------------------
let quitConfirmed = false;

Electrobun.events.on("before-quit", (event) => {
	if (quitConfirmed || !timer.status()) {
		tracking.sampler.stop();
		timer.dispose();
		return;
	}
	event.response = { allow: false };
	void confirmQuit();
});

async function confirmQuit() {
	const { response } = await Utils.showMessageBox({
		type: "question",
		title: strings.dialogs.quitTitle,
		message: strings.dialogs.quitTitle,
		detail: strings.dialogs.quitMessage,
		buttons: [strings.dialogs.quitStop, strings.dialogs.quitKeep, strings.dialogs.cancel],
		defaultId: 0,
		cancelId: 2,
	});
	if (response === 0) timer.stop();
	else if (response === 1) timer.markKeptOnQuit();
	else return;
	quitConfirmed = true;
	Utils.quit();
}

// --- Update ----------------------------------------------------------------
// Only when the user asks (open question 5). An update restart keeps the timer running, as
// "Quit and keep running" does (D12), so the quit question is not asked.
async function installUpdate() {
	try {
		await Updater.downloadUpdate();
		const info = Updater.updateInfo();
		if (!info.updateReady) throw new Error(info.error || "The download did not finish.");
		timer.markKeptOnQuit();
		quitConfirmed = true;
		await Updater.applyUpdate();
	} catch (error) {
		quitConfirmed = false;
		timer.clearKeptOnQuit();
		console.error("[clipa] update failed:", error);
		if (!mainWindow) openMainWindow();
		send("updateFailed", { message: error instanceof Error ? error.message : String(error) });
	}
}

// --- Start -----------------------------------------------------------------
const cleanup = tracking.startup();
console.log(`[clipa] tracking: kept ${cleanup.keptIdle} idle periods, deleted ${cleanup.purged} old activity rows`);
// Utils.showMessageBox is a synchronous FFI call: it blocks this event loop
// (heartbeat, RPC, tray) until answered. So the recovery dialog is in the view.
const recovery = timer.recover();
if (recovery.kind === "recovered") {
	pendingRecovery = { entry: recovery.entry, endedAt: recovery.endedAt };
	console.log(`[clipa] recovered entry ${recovery.entry.id}, ended at ${new Date(recovery.endedAt).toISOString()}`);
}
if (recovery.kind === "continued") console.log(`[clipa] continued entry ${recovery.entry.id} kept on quit`);
dailyBackup();
setInterval(dailyBackup, DAILY_CHECK_MS);
tray.refresh();
openMainWindow();
Electrobun.events.on("reopen", () => openMainWindow());

// Electrobun gives roles no shortcut. An accelerator is one key: ⌘ on macOS, Ctrl on Windows.
// ⌘Q quits (with the running-timer question); ⌘W closes the window and Clipa stays in the tray.
ApplicationMenu.setApplicationMenu([
	{
		label: strings.appName,
		submenu: [
			{ role: "about" },
			{ type: "separator" },
			{ role: "hide" },
			{ role: "hideOthers" },
			{ role: "quit", accelerator: "q" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
	{ label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close", accelerator: "w" }] },
]);

console.log("[clipa] started");
