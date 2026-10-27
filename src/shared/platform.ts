// The OS Clipa runs on. The main process reads it from Bun, the view from the webview.
export type Platform = "macos" | "windows" | "linux";

/** From Bun's process.platform ("darwin", "win32") or the webview's navigator.platform ("MacIntel", "Win32"). */
export function platformOf(id: string): Platform {
	if (/^win/i.test(id)) return "windows";
	if (/^(darwin|mac)/i.test(id)) return "macos";
	return "linux";
}

const bunPlatform: string | undefined = typeof process !== "undefined" ? process.platform : undefined;

export const platform: Platform = platformOf(bunPlatform || navigator.platform || navigator.userAgent);
