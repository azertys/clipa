import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "../../shared/platform";
import { parseFocusedWindow } from "./gio";
import { autostartEntry, autostartFile, autostartState, execArgument, isWayland, loadLinux } from "./linux";
import { compoundText } from "./x11";

test("the session type decides between X11 and Wayland", () => {
	expect(isWayland({ XDG_SESSION_TYPE: "wayland" })).toBe(true);
	expect(isWayland({ WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" })).toBe(true);
	expect(isWayland({ XDG_SESSION_TYPE: "x11", DISPLAY: ":0" })).toBe(false);
});

test("the GNOME extension's JSON gives the window's classes, process and title", () => {
	expect(
		parseFocusedWindow(
			'{"title":"Calculator","wm_class":"org.gnome.Calculator","wm_class_instance":"org.gnome.Calculator","pid":56643,"focus":true}',
		),
	).toEqual({ pid: 56643, classes: ["org.gnome.Calculator", "org.gnome.Calculator"], title: "Calculator" });
	expect(parseFocusedWindow('{"wm_class":"firefox","title":""}')).toEqual({ pid: null, classes: ["firefox"], title: null });
	expect(parseFocusedWindow("{}")).toBeNull();
	expect(parseFocusedWindow("not json")).toBeNull();
});

describe("launch at login", () => {
	test("the entry is in the autostart folder", () => {
		expect(autostartFile({}, "dev.clipa.app", "/home/a")).toBe("/home/a/.config/autostart/dev.clipa.app.desktop");
		expect(autostartFile({ XDG_CONFIG_HOME: "/cfg" }, "dev.clipa.app.canary", "/home/a")).toBe(
			"/cfg/autostart/dev.clipa.app.canary.desktop",
		);
	});

	test("Exec quotes the program path (Desktop Entry spec)", () => {
		expect(execArgument("/home/a/.local/share/dev.clipa.app/stable/app/bin/launcher")).toBe(
			'"/home/a/.local/share/dev.clipa.app/stable/app/bin/launcher"',
		);
		expect(execArgument("/home/my name/bin/launcher")).toBe('"/home/my name/bin/launcher"');
		expect(execArgument('/a"b`c$d\\e%f')).toBe('"/a\\\\"b\\\\`c\\\\$d\\\\\\\\e%%f"');
	});

	test("the entry starts the launcher", () => {
		expect(autostartEntry({ name: "Clipa", program: "/opt/Clipa/bin/launcher", icon: "/opt/Clipa/Resources/appIcon.png" })).toBe(
			[
				"[Desktop Entry]",
				"Type=Application",
				"Name=Clipa",
				'Exec="/opt/Clipa/bin/launcher"',
				"Icon=/opt/Clipa/Resources/appIcon.png",
				"Terminal=false",
				"X-GNOME-Autostart-enabled=true",
				"",
			].join("\n"),
		);
	});

	test("an entry turned off by the desktop is off", () => {
		const dir = mkdtempSync(join(tmpdir(), "clipa-autostart-"));
		const file = join(dir, "dev.clipa.app.desktop");
		expect(autostartState(file)).toBe("off");
		writeFileSync(file, autostartEntry({ name: "Clipa", program: "/x/launcher", icon: null }));
		expect(autostartState(file)).toBe("on");
		writeFileSync(file, "[Desktop Entry]\nExec=x\nX-GNOME-Autostart-enabled=false\n");
		expect(autostartState(file)).toBe("off");
		writeFileSync(file, "[Desktop Entry]\nExec=x\nHidden=true\n");
		expect(autostartState(file)).toBe("off");
	});
});

// The system libraries, on a Linux machine (CI has no display and no session bus).
test.skipIf(platform !== "linux")("the Linux calls load and answer without a desktop", () => {
	let loaded: ReturnType<typeof loadLinux> | null = null;
	try {
		loaded = loadLinux({ own: { key: "dev.clipa.app", name: "Clipa" }, launcher: "/none", icon: null, loginName: "x" });
	} catch (error) {
		// Without X11 and without a session bus there is nothing to load.
		expect(String(error)).toContain("Neither X11 nor the session bus");
		return;
	}
	const { tracker, system } = loaded;
	expect(() => tracker.frontmostApp()).not.toThrow();
	expect(() => tracker.focusedWindowTitle()).not.toThrow();
	expect(tracker.idleSeconds()).toBeGreaterThanOrEqual(0);
	expect(typeof tracker.measuresIdle()).toBe("boolean");
	expect(system.launchAtLogin()).toBe("unavailable");
});

test("a COMPOUND_TEXT title is Latin-1 with UTF-8 parts", () => {
	const title = Buffer.concat([
		Buffer.from("Résumé ", "latin1"),
		Buffer.from("\x1b%G—\x1b%@", "utf8"),
		Buffer.from(" draft.txt \x1b-A", "latin1"),
	]);
	expect(compoundText(title)).toBe("Résumé — draft.txt ");
	expect(compoundText(Buffer.from("plain"))).toBe("plain");
});
