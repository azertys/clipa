// App names on Linux come from the desktop entries (.desktop files) of the installed apps: a
// window has a class ("Code"), its app's entry has the name ("Visual Studio Code").
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { posix } from "node:path";

export type DesktopApp = { id: string; name: string };

/** After a miss, the folders are read again at most this often (a new app was installed). */
const RESCAN_MS = 60_000;

/** The applications folders, first ones first (XDG Base Directory spec), and Snap's folder. */
export function applicationDirs(env: Record<string, string | undefined>, home = homedir()): string[] {
	const dataHome = env.XDG_DATA_HOME || posix.join(home, ".local", "share");
	const dataDirs = (env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":").filter(Boolean);
	const dirs = [dataHome, ...dataDirs].map((dir) => posix.join(dir, "applications"));
	return [...new Set([...dirs, "/var/lib/snapd/desktop/applications"])];
}

/** The [Desktop Entry] group's Name and StartupWMClass. Translated names (Name[de]) are skipped. */
export function parseDesktopEntry(text: string): { name?: string; wmClass?: string } {
	const entry: { name?: string; wmClass?: string } = {};
	let inEntry = false;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("[")) {
			inEntry = line === "[Desktop Entry]";
			continue;
		}
		if (!inEntry) continue;
		const eq = line.indexOf("=");
		if (eq < 0) continue;
		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1).trim();
		if (key === "Name" && !entry.name) entry.name = value;
		else if (key === "StartupWMClass" && !entry.wmClass) entry.wmClass = value;
	}
	return entry;
}

/** Finds the app of a window by its class names, from the desktop entries in `dirs`. */
export class DesktopEntries {
	private byId = new Map<string, DesktopApp>();
	private byClass = new Map<string, DesktopApp>();
	private scannedAt = -Infinity;

	constructor(
		private readonly dirs: string[],
		private readonly now: () => number = Date.now,
	) {}

	/** The app for a window with these class names (WM_CLASS class and instance, or a Wayland app id). */
	find(classes: string[]): DesktopApp | null {
		if (this.scannedAt === -Infinity) this.scan();
		const found = this.lookup(classes);
		if (found || this.now() - this.scannedAt < RESCAN_MS) return found;
		this.scan();
		return this.lookup(classes);
	}

	private lookup(classes: string[]): DesktopApp | null {
		const names = classes.filter(Boolean).map((c) => c.toLowerCase());
		for (const name of names) {
			const app = this.byClass.get(name) ?? this.byId.get(name);
			if (app) return app;
		}
		// A reverse-DNS id: "org.mozilla.firefox" for the class "firefox".
		for (const name of names) {
			for (const [id, app] of this.byId) if (id.endsWith(`.${name}`)) return app;
		}
		return null;
	}

	private scan() {
		this.scannedAt = this.now();
		this.byId.clear();
		this.byClass.clear();
		for (const dir of this.dirs) {
			let files: string[];
			try {
				files = readdirSync(dir).filter((f) => f.endsWith(".desktop"));
			} catch {
				continue;
			}
			for (const file of files) {
				const id = file.slice(0, -".desktop".length);
				// An entry in an earlier folder hides the one with the same id in a later folder.
				if (this.byId.has(id.toLowerCase())) continue;
				let entry: ReturnType<typeof parseDesktopEntry>;
				try {
					entry = parseDesktopEntry(readFileSync(posix.join(dir, file), "utf8"));
				} catch {
					continue;
				}
				if (!entry.name) continue;
				const app = { id, name: entry.name };
				this.byId.set(id.toLowerCase(), app);
				const wmClass = entry.wmClass?.toLowerCase();
				if (wmClass && !this.byClass.has(wmClass)) this.byClass.set(wmClass, app);
			}
		}
	}
}
