// One interface for the platform calls of macOS (macos.ts), Windows (windows.ts) and Linux (linux.ts).
import type { LaunchAtLogin } from "../../shared/rpc-schema";

export type { LaunchAtLogin };

export interface NativeTracker {
	/** key: the bundle id on macOS, the program file name on Windows, the desktop entry on Linux. */
	frontmostApp(): { key: string; name: string } | null;
	focusedWindowTitle(): string | null; // null = no permission or no window
	idleSeconds(): number;
	/** False when this system gives no idle time (some Linux desktops). */
	measuresIdle(): boolean;
	hasTitlePermission(): boolean;
	requestTitlePermission(): void; // shows the system prompt
}

/** Platform calls outside tracking. "approval": the user must allow it in the system's settings. */
export interface NativeSystem {
	launchAtLogin(): LaunchAtLogin;
	setLaunchAtLogin(on: boolean): LaunchAtLogin;
	/** Brings Clipa to the front, so that a native dialog shown next is on top. */
	activate(): void;
}

/** Clipa's own windows, recorded as Clipa. */
export type OwnApp = { key: string; name: string };

/** Used when no native library is available (failed load). */
export const nullTracker: NativeTracker = {
	frontmostApp: () => null,
	focusedWindowTitle: () => null,
	idleSeconds: () => 0,
	measuresIdle: () => false,
	hasTitlePermission: () => false,
	requestTitlePermission: () => {},
};

export const nullSystem: NativeSystem = {
	launchAtLogin: () => "unavailable",
	setLaunchAtLogin: () => "unavailable",
	activate: () => {},
};
