// Clipa main process: database, timer, tray, window and RPC.
import Electrobun, { ApplicationMenu, BrowserWindow, PATHS, Updater, Utils } from "electrobun/main";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Combo } from "../../core/entries";
import type { EntryWithTags } from "../../core/types";
import { strings } from "../mainview/strings";
import { platform } from "../shared/platform";
import type { Navigation, RecoveryNotice } from "../shared/rpc-schema";
import { openDatabase } from "./db/database";
import type { WriteContext } from "./db/repo";
import { deviceId, readSettings } from "./db/settings";
import { loadLinux } from "./native/linux";
import { dylibPath, loadMac } from "./native/macos";
import { nullSystem, nullTracker, type NativeSystem, type NativeTracker, type OwnApp } from "./native/tracker";
import { loadWindows } from "./native/windows";
import { createRpc, type AppContext, type ClipaBunRpc } from "./rpc";
import { Backups, DAILY_CHECK_MS } from "./services/backups";
import { claimInstance, instanceAddress } from "./services/single-instance";
import { SHORT_ENTRY_MS, TimerService } from "./services/timer";
import { Tracking } from "./services/tracking";
import { ClipaTray } from "./tray";

const DEV_SERVER_URL = "http://localhost:5173";

// --- One Clipa -------------------------------------------------------------
mkdirSync(Utils.paths.userData, { recursive: true });
// Set when the start is done: a second start then opens the window.
let started = false;
// macOS starts an app once and sends "reopen". On Windows and Linux a second start asks the
// first Clipa to show its window, then quits.
if (platform !== "macos" && !(await firstInstance())) {
	console.log("[clipa] Clipa is already running: it shows its window");
	Utils.quit();
	// Quitting takes a moment, and nothing below may run.
	await new Promise(() => {});
}

async function firstInstance(): Promise<boolean> {
	try {
		return await claimInstance(instanceAddress(platform, Utils.paths.userData), () => {
			if (started) openMainWindow();
		});
	} catch (error) {
		console.warn("[clipa] could not check for another Clipa:", error);
		return true;
	}
}

// --- Data ------------------------------------------------------------------
const dbPath = join(Utils.paths.userData, "clipa.db");
const db = openDatabase(dbPath);
const ctx: WriteContext = { deviceId: deviceId(db), now: Date.now };
console.log(`[clipa] db=${dbPath}`);

// Database copies: today's at start, then checked every hour while Clipa runs.
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

// --- Native calls ----------------------------------------------------------
// macOS: the Swift library (native/macos). Windows and Linux: the system's own libraries.
// Without them the timer works and nothing is sampled (nullTracker).
const local = await Updater.getLocalInfo();
const own: OwnApp = { key: local.identifier || "dev.clipa.app", name: strings.appName };
const stable = local.channel === "stable";
// bin/ has the launcher, which starts Clipa at login; Resources/ is next to it.
const bin = dirname(process.execPath);
let tracker: NativeTracker = nullTracker;
let system: NativeSystem = nullSystem;
let nativeLoaded = false;
try {
	if (platform === "macos") {
		({ tracker, system } = loadMac(dylibPath(PATHS.RESOURCES_FOLDER)));
	} else if (platform === "windows") {
		({ tracker, system } = loadWindows({
			own,
			launcher: join(bin, "launcher.exe"),
			loginName: stable ? own.name : `${own.name} (${local.channel})`,
		}));
	} else {
		const icon = join(bin, "..", "Resources", "appIcon.png");
		({ tracker, system } = loadLinux({
			own,
			launcher: join(bin, "launcher"),
			icon: existsSync(icon) ? icon : null,
			loginName: stable ? own.key : `${own.key}.${local.channel}`,
		}));
	}
	nativeLoaded = true;
} catch (error) {
	console.error("[clipa] native calls failed to load:", error);
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
	// The question is in a window of its own (a native dialog would block this process).
	onPrompt: () => openIdleWindow(),
});

function startFromTray() {
	timer.start(draft ?? { note: "", tagIds: readSettings(db).defaultTagIds });
}

// --- Window ----------------------------------------------------------------
async function mainViewUrl(): Promise<string> {
	if (local.channel === "dev") {
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

/** What a window's RPC handlers use. */
function windowContext(window: Pick<AppContext, "onDataChanged" | "closeWindow">): AppContext {
	return {
		db,
		ctx,
		timer,
		tracking,
		tracker,
		system,
		backups,
		info: { version: "0.1.1", deviceId: ctx.deviceId, dbPath, nativeLoaded },
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
		installUpdate: () => void installUpdate(),
		...window,
	};
}

function openMainWindow(navigation?: Navigation) {
	if (mainWindow) {
		mainWindow.show();
		mainWindow.activate();
		if (navigation) send("navigate", navigation);
		return;
	}
	// The view asks for this with uiReady() once it has mounted.
	if (navigation) pendingNavigation = navigation;
	rpc = createRpc(windowContext({ onDataChanged: () => tray?.refresh(), closeWindow: () => mainWindow?.close() }));
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

// --- Idle window -----------------------------------------------------------
let idleWindow: BrowserWindow | null = null;

/**
 * The idle question in a small window of its own, on top of other apps and on every desktop,
 * with the focus. The view loads in idle mode (#idle) and asks for the question.
 */
function openIdleWindow() {
	if (idleWindow) {
		idleWindow.show();
		idleWindow.activate();
		return;
	}
	const idleRpc = createRpc(
		windowContext({
			// The main window shows the result of the answer.
			onDataChanged: () => {
				tray?.refresh();
				send("dataChanged", {});
			},
			closeWindow: () => idleWindow?.close(),
		}),
	);
	idleWindow = new BrowserWindow({
		title: strings.appName,
		url: `${url}#idle`,
		rpc: idleRpc,
		frame: { width: 440, height: 150 },
		styleMask: { Miniaturizable: false, Resizable: false },
	});
	idleWindow.setAlwaysOnTop(true);
	idleWindow.setVisibleOnAllWorkspaces(true);
	idleWindow.activate();
	idleWindow.on("close", () => {
		idleWindow = null;
		// Closed without an answer: the time is kept, as with Esc.
		const question = tracking.idle.question();
		if (question) tracking.resolve(question.id, "keep");
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
	// From the tray Clipa is not the active app, and the question would open behind other windows.
	system.activate();
	const { quitTitle, quitMessage } = strings.dialogs;
	const { response } = await Utils.showMessageBox({
		type: "question",
		// macOS shows the title in bold and the message under it, and drops `detail`. Windows and
		// Linux show the title on the window, the message in bold and the detail under it.
		...(platform === "macos"
			? { title: quitTitle, message: quitMessage }
			: { title: strings.appName, message: quitTitle, detail: quitMessage }),
		buttons: [strings.dialogs.quitStop, strings.dialogs.quitKeep, strings.dialogs.cancel],
		defaultId: 0,
		cancelId: 2,
	});
	// The dialog blocked this process; that time is not sleep.
	tracking.sampler.resume();
	if (response === 0) timer.stop();
	else if (response === 1) timer.markKeptOnQuit();
	else return;
	quitConfirmed = true;
	Utils.quit();
}

// --- Update ----------------------------------------------------------------
// Only when the user asks. An update restart keeps the timer running, as
// "Quit and keep running" does, so the quit question is not asked.
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
started = true;

// Electrobun gives roles no shortcut. An accelerator is one key: ⌘ on macOS.
// ⌘Q quits (with the running-timer question); ⌘W closes the window and Clipa stays in the tray.
// On Windows the app menu is a menu bar in the window, and Linux has none: there the view
// handles Ctrl+W, Alt+F4 and Ctrl+Q (App.svelte).
if (platform === "macos") {
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
}

console.log("[clipa] started");
