// Linux: an X11 session gives the active window and the idle time through Xlib (x11.ts). On
// Wayland they come from GNOME over D-Bus (gio.ts); other Wayland desktops give neither.
// Launch at login is a desktop entry in the autostart folder.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, posix } from "node:path";
import { applicationDirs, DesktopEntries } from "./desktop-entries";
import { openSessionBus } from "./gio";
import type { LaunchAtLogin, NativeSystem, NativeTracker, OwnApp } from "./tracker";
import { openX11 } from "./x11";

/** The sampler asks for the app and then for the title: one read of the window serves both. */
const WINDOW_CACHE_MS = 200;

type ActiveWindow = { pid: number | null; classes: string[]; title: string | null };

export type LinuxOptions = {
	own: OwnApp;
	/** bin/launcher, which starts Clipa. */
	launcher: string;
	/** The app icon for the autostart entry, if there is one. */
	icon: string | null;
	/** The name of the autostart file, without .desktop: one per channel. */
	loginName: string;
};

/** Electrobun runs GTK on X11 also on Wayland (XWayland), so the session type decides. */
export function isWayland(env: Record<string, string | undefined>): boolean {
	return env.XDG_SESSION_TYPE === "wayland" || Boolean(env.WAYLAND_DISPLAY);
}

function attempt<T>(open: () => T | null, what: string): T | null {
	try {
		return open();
	} catch (error) {
		console.warn(`[clipa] ${what} is not available:`, error);
		return null;
	}
}

export function loadLinux({ own, launcher, icon, loginName }: LinuxOptions): {
	tracker: NativeTracker;
	system: NativeSystem;
} {
	const wayland = isWayland(process.env);
	const x11 = wayland ? null : attempt(openX11, "X11");
	const bus = attempt(openSessionBus, "The session bus");
	if (!x11 && !bus) throw new Error("Neither X11 nor the session bus could be opened");
	const entries = new DesktopEntries(applicationDirs(process.env));
	const apps = new Map<string, { key: string; name: string }>();

	let last: { at: number; window: ActiveWindow | null } | null = null;
	function activeWindow(): ActiveWindow | null {
		const now = Date.now();
		if (last && now - last.at < WINDOW_CACHE_MS) return last.window;
		const window = x11 ? x11.activeWindow() : (bus?.focusedWindow() ?? null);
		last = { at: now, window };
		return window;
	}

	/** The app of a window class, by its desktop entry. The key is the entry's id when there is one. */
	function appOf(classes: string[]): { key: string; name: string } {
		const cacheKey = classes.join("\0");
		let app = apps.get(cacheKey);
		if (app) return app;
		const entry = entries.find(classes);
		app = entry ? { key: entry.id, name: entry.name } : { key: classes[0].toLowerCase(), name: classes[0] };
		// A class without an entry is looked up again, in case its app was just installed.
		if (entry) apps.set(cacheKey, app);
		return app;
	}

	const idleMs = () => x11?.idleMs() ?? bus?.idleMs() ?? null;

	const tracker: NativeTracker = {
		frontmostApp() {
			const window = activeWindow();
			if (!window || window.classes.length === 0) return null;
			return window.pid === process.pid ? own : appOf(window.classes);
		},
		focusedWindowTitle: () => activeWindow()?.title ?? null,
		idleSeconds: () => (idleMs() ?? 0) / 1000,
		measuresIdle: () => idleMs() !== null,
		// Linux needs no permission for window titles.
		hasTitlePermission: () => true,
		requestTitlePermission: () => {},
	};

	const file = autostartFile(process.env, loginName);
	const entry = autostartEntry({ name: own.name, program: launcher, icon });
	const system: NativeSystem = {
		launchAtLogin: () => (existsSync(launcher) ? autostartState(file) : "unavailable"),
		setLaunchAtLogin(on) {
			if (!existsSync(launcher)) return "unavailable";
			if (on) {
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, entry);
			} else {
				rmSync(file, { force: true });
			}
			return autostartState(file);
		},
		// The window manager decides what comes to the front.
		activate: () => {},
	};
	return { tracker, system };
}

/** ~/.config/autostart/<name>.desktop (XDG Autostart spec). */
export function autostartFile(env: Record<string, string | undefined>, name: string, home = homedir()): string {
	return posix.join(env.XDG_CONFIG_HOME || posix.join(home, ".config"), "autostart", `${name}.desktop`);
}

/**
 * One argument of an Exec key, in quotes (Desktop Entry spec). Inside quotes \ " ` $ take a
 * backslash; then the file's string escapes double each backslash. % is written %%.
 */
export function execArgument(value: string): string {
	const quoted = value.replace(/[\\"`$]/g, (c) => `\\${c}`);
	return `"${quoted.replaceAll("\\", "\\\\").replaceAll("%", "%%")}"`;
}

export function autostartEntry({ name, program, icon }: { name: string; program: string; icon: string | null }): string {
	const lines = [
		"[Desktop Entry]",
		"Type=Application",
		`Name=${name}`,
		`Exec=${execArgument(program)}`,
		...(icon ? [`Icon=${icon}`] : []),
		"Terminal=false",
		"X-GNOME-Autostart-enabled=true",
	];
	return `${lines.join("\n")}\n`;
}

/** On when the file is there and not turned off (Hidden, or GNOME's own key). */
export function autostartState(file: string): LaunchAtLogin {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return "off";
	}
	return /^Hidden\s*=\s*true\s*$/m.test(text) || /^X-GNOME-Autostart-enabled\s*=\s*false\s*$/m.test(text)
		? "off"
		: "on";
}
