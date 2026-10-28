import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationDirs, DesktopEntries, parseDesktopEntry } from "./desktop-entries";

function folder(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "clipa-apps-"));
	mkdirSync(dir, { recursive: true });
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	return dir;
}
const entry = (name: string, extra = "") => `[Desktop Entry]\nType=Application\nName=${name}\n${extra}`;

test("the applications folders follow the XDG variables, the user's first", () => {
	expect(applicationDirs({}, "/home/a")).toEqual([
		"/home/a/.local/share/applications",
		"/usr/local/share/applications",
		"/usr/share/applications",
		"/var/lib/snapd/desktop/applications",
	]);
	expect(
		applicationDirs({ XDG_DATA_HOME: "/data", XDG_DATA_DIRS: "/var/lib/flatpak/exports/share:/usr/share" }, "/home/a"),
	).toEqual([
		"/data/applications",
		"/var/lib/flatpak/exports/share/applications",
		"/usr/share/applications",
		"/var/lib/snapd/desktop/applications",
	]);
});

test("the name and window class come from the [Desktop Entry] group", () => {
	const text = [
		"# comment",
		"[Desktop Entry]",
		"Name[de]=Rechner",
		"Name=Calculator",
		"StartupWMClass=gnome-calculator",
		"[Desktop Action new-window]",
		"Name=New Window",
	].join("\n");
	expect(parseDesktopEntry(text)).toEqual({ name: "Calculator", wmClass: "gnome-calculator" });
	expect(parseDesktopEntry("[Desktop Action x]\nName=X")).toEqual({});
});

test("a window class finds its app by StartupWMClass, by id, or by the end of a reverse-DNS id", () => {
	const dir = folder({
		"code.desktop": entry("Visual Studio Code", "StartupWMClass=Code"),
		"org.gnome.Terminal.desktop": entry("Terminal", "StartupWMClass=gnome-terminal-server"),
		"org.mozilla.firefox.desktop": entry("Firefox"),
		"google-chrome.desktop": entry("Google Chrome"),
		"broken.desktop": "[Desktop Entry]\nType=Application\n",
		"notes.txt": entry("Not an entry"),
	});
	const apps = new DesktopEntries([dir]);
	expect(apps.find(["Code", "code"])).toEqual({ id: "code", name: "Visual Studio Code" });
	expect(apps.find(["Gnome-terminal-server", "gnome-terminal-server"])).toEqual({ id: "org.gnome.Terminal", name: "Terminal" });
	expect(apps.find(["org.gnome.Terminal"])).toEqual({ id: "org.gnome.Terminal", name: "Terminal" });
	expect(apps.find(["Google-chrome", "google-chrome"])).toEqual({ id: "google-chrome", name: "Google Chrome" });
	expect(apps.find(["firefox", "Navigator"])).toEqual({ id: "org.mozilla.firefox", name: "Firefox" });
	expect(apps.find(["broken"])).toBeNull();
	expect(apps.find(["xterm"])).toBeNull();
});

test("the user's entry hides the system one, and a miss reads the folders again after a minute", () => {
	const user = folder({ "editor.desktop": entry("My Editor") });
	const system = folder({ "editor.desktop": entry("Editor") });
	let now = 0;
	const apps = new DesktopEntries([user, system], () => now);
	expect(apps.find(["editor"])?.name).toBe("My Editor");
	expect(apps.find(["newapp"])).toBeNull();
	writeFileSync(join(system, "newapp.desktop"), entry("New App"));
	now = 30_000;
	expect(apps.find(["newapp"])).toBeNull();
	now = 61_000;
	expect(apps.find(["newapp"])?.name).toBe("New App");
});
