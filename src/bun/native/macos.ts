// FFI wrapper for libclipanative.dylib (native/macos).
import { CString, dlopen, FFIType, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NativeTracker } from "./tracker";

const symbols = {
	tn_frontmost_bundle_id: { args: [], returns: FFIType.ptr },
	tn_idle_seconds: { args: [], returns: FFIType.f64 },
	tn_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

type Lib = ReturnType<typeof dlopen<typeof symbols>>["symbols"];

/** Bundled path: build.copy puts the dylib in Resources/app/native. */
export function dylibPath(resourcesFolder: string): string {
	return join(resourcesFolder, "app", "native", "libclipanative.dylib");
}

export function loadMacTracker(path: string): NativeTracker {
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

	return {
		frontmostApp() {
			const key = take(lib.tn_frontmost_bundle_id() as Pointer | null);
			// The display name arrives with the full library in M4.
			return key ? { key, name: key } : null;
		},
		focusedWindowTitle: () => null,
		idleSeconds: () => lib.tn_idle_seconds(),
		hasTitlePermission: () => false,
		requestTitlePermission: () => {},
	};
}
