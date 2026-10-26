// One interface for all platform calls, so Windows and Linux can be added later.
import type { LaunchAtLogin } from "../../shared/rpc-schema";

export type { LaunchAtLogin };

export interface NativeTracker {
	frontmostApp(): { key: string; name: string } | null; // key = bundle id on macOS
	focusedWindowTitle(): string | null; // null = no permission or no window
	idleSeconds(): number;
	hasTitlePermission(): boolean;
	requestTitlePermission(): void; // shows the system prompt
}

/** Platform calls outside tracking. "approval": the user must allow it in System Settings. */
export interface NativeSystem {
	launchAtLogin(): LaunchAtLogin;
	setLaunchAtLogin(on: boolean): LaunchAtLogin;
}

/** Used when no native library is available (other platforms, failed load). */
export const nullTracker: NativeTracker = {
	frontmostApp: () => null,
	focusedWindowTitle: () => null,
	idleSeconds: () => 0,
	hasTitlePermission: () => false,
	requestTitlePermission: () => {},
};

export const nullSystem: NativeSystem = {
	launchAtLogin: () => "unavailable",
	setLaunchAtLogin: () => "unavailable",
};
