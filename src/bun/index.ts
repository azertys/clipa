// Clipa main process: database, timer, tray, window and RPC.
import Electrobun, { ApplicationMenu, BrowserWindow, PATHS, Updater, Utils } from "electrobun/main";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Combo } from "../../core/entries";
import type { EntryWithTags } from "../../core/types";
import { strings } from "../mainview/strings";
import type { Navigation, RecoveryNotice } from "../shared/rpc-schema";
import { openDatabase } from "./db/database";
import type { WriteContext } from "./db/repo";
import { deviceId, readSettings } from "./db/settings";
import { dylibPath, loadMacTracker } from "./native/macos";
import { nullTracker, type NativeTracker } from "./native/tracker";
import { createRpc, type ClipaBunRpc } from "./rpc";
import { SHORT_ENTRY_MS, TimerService } from "./services/timer";
import { ClipaTray } from "./tray";

const DEV_SERVER_URL = "http://localhost:5173";

// --- Data ------------------------------------------------------------------
mkdirSync(Utils.paths.userData, { recursive: true });
const dbPath = join(Utils.paths.userData, "clipa.db");
const db = openDatabase(dbPath);
const ctx: WriteContext = { deviceId: deviceId(db), now: Date.now };
console.log(`[clipa] db=${dbPath}`);

// --- Native library --------------------------------------------------------
// The sampler and idle monitor use it from M4.
let tracker: NativeTracker = nullTracker;
let nativeLoaded = false;
if (process.platform === "darwin") {
	try {
		tracker = loadMacTracker(dylibPath(PATHS.RESOURCES_FOLDER));
		nativeLoaded = true;
	} catch (error) {
		console.error("[clipa] native library failed to load:", error);
	}
}
void tracker;

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
		tray?.refresh();
		send("timerChanged", { entry });
		send("dataChanged", {});
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
		info: { version: "0.1.0", deviceId: ctx.deviceId, dbPath, nativeLoaded },
		takeUiStart: () => {
			const start = { navigation: pendingNavigation, recovery: pendingRecovery };
			console.log(`[clipa] view ready, recovery notice: ${start.recovery ? "yes" : "no"}`);
			pendingNavigation = null;
			pendingRecovery = null;
			return start;
		},
		setDraft: (next) => {
			draft = next;
		},
		onDataChanged: () => tray?.refresh(),
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

// --- Start -----------------------------------------------------------------
// Utils.showMessageBox is a synchronous FFI call: it blocks this event loop
// (heartbeat, RPC, tray) until answered. So the recovery dialog is in the view.
const recovery = timer.recover();
if (recovery.kind === "recovered") {
	pendingRecovery = { entry: recovery.entry, endedAt: recovery.endedAt };
	console.log(`[clipa] recovered entry ${recovery.entry.id}, ended at ${new Date(recovery.endedAt).toISOString()}`);
}
if (recovery.kind === "continued") console.log(`[clipa] continued entry ${recovery.entry.id} kept on quit`);
tray.refresh();
openMainWindow();
Electrobun.events.on("reopen", () => openMainWindow());

ApplicationMenu.setApplicationMenu([
	{
		label: strings.appName,
		submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "quit" }],
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
	{ label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] },
]);

console.log("[clipa] started");
