// One interface for all platform calls, so Windows and Linux can be added later.
export interface NativeTracker {
	frontmostApp(): { key: string; name: string } | null; // key = bundle id on macOS
	focusedWindowTitle(): string | null; // null = no permission or no window
	idleSeconds(): number;
	hasTitlePermission(): boolean;
	requestTitlePermission(): void; // shows the system prompt
}

/** Used when no native library is available (other platforms, failed load). */
export const nullTracker: NativeTracker = {
	frontmostApp: () => null,
	focusedWindowTitle: () => null,
	idleSeconds: () => 0,
	hasTitlePermission: () => false,
	requestTitlePermission: () => {},
};
