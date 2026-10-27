import { platform } from "../../shared/platform";

/** The shortcut key: ⌘ on macOS, Ctrl on Windows and Linux. */
export function primaryKey(e: KeyboardEvent): boolean {
	return platform === "macos" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** A shortcut as the OS writes it: "⌘F" on macOS, "Ctrl+F" on Windows and Linux. */
export function shortcut(key: string): string {
	return platform === "macos" ? `⌘${key}` : `Ctrl+${key}`;
}
