// FFI wrapper for libclipanative.dylib (native/macos).
import { CString, dlopen, FFIType, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LaunchAtLogin, NativeSystem, NativeTracker } from "./tracker";

const symbols = {
	tn_frontmost_bundle_id: { args: [], returns: FFIType.ptr },
	tn_frontmost_app_name: { args: [], returns: FFIType.ptr },
	tn_focused_window_title: { args: [], returns: FFIType.ptr },
	tn_idle_seconds: { args: [], returns: FFIType.f64 },
	tn_ax_trusted: { args: [FFIType.i32], returns: FFIType.i32 },
	tn_launch_at_login_get: { args: [], returns: FFIType.i32 },
	tn_launch_at_login_set: { args: [FFIType.i32], returns: FFIType.i32 },
	tn_activate_app: { args: [], returns: FFIType.void },
	tn_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

type Lib = ReturnType<typeof dlopen<typeof symbols>>["symbols"];

/** Bundled path: build.copy puts the dylib in Resources/app/native. */
export function dylibPath(resourcesFolder: string): string {
	return join(resourcesFolder, "app", "native", "libclipanative.dylib");
}

const LAUNCH_STATES: Record<number, LaunchAtLogin> = { 1: "on", 0: "off", 2: "approval" };

export function loadMac(path: string): { tracker: NativeTracker; system: NativeSystem } {
	if (!existsSync(path)) throw new Error(`Native library not found: ${path}`);
	const lib: Lib = dlopen(path, symbols).symbols;

	// Copy the C string into JS memory, then free the native copy.
	const take = (ptr: Pointer | null): string | null => {
		if (!ptr) return null;
		try {
			return new CString(ptr).toString();
		} finally {
			lib.tn_free(ptr);
		}
	};

	// The sampler asks every second; the name is read again only when the app changes.
	let last: { key: string; name: string } | null = null;

	const tracker: NativeTracker = {
		frontmostApp() {
			const key = take(lib.tn_frontmost_bundle_id() as Pointer | null);
			if (!key) return null;
			if (last?.key !== key) last = { key, name: take(lib.tn_frontmost_app_name() as Pointer | null) ?? key };
			return last;
		},
		focusedWindowTitle: () => take(lib.tn_focused_window_title() as Pointer | null),
		idleSeconds: () => lib.tn_idle_seconds(),
		hasTitlePermission: () => lib.tn_ax_trusted(0) === 1,
		requestTitlePermission: () => void lib.tn_ax_trusted(1),
	};
	const system: NativeSystem = {
		launchAtLogin: () => LAUNCH_STATES[lib.tn_launch_at_login_get()] ?? "unavailable",
		setLaunchAtLogin: (on) => LAUNCH_STATES[lib.tn_launch_at_login_set(on ? 1 : 0)] ?? "unavailable",
		activate: () => lib.tn_activate_app(),
	};
	return { tracker, system };
}
