import { expect, test } from "bun:test";
import { platform } from "../../shared/platform";
import { approvedOff, loadWindows, openWindowsLibs, programDescription, programKey, programName, runKeyItem } from "./windows";

const onWindows = test.skipIf(platform !== "windows");

test("the key and fallback name come from the program file", () => {
	expect(programKey("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")).toBe("chrome.exe");
	expect(programKey("C:\\Users\\A\\AppData\\Local\\Discord\\app-1.0.9013\\Discord.exe")).toBe("discord.exe");
	expect(programName("C:\\Users\\A\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe")).toBe("Code");
});

test("Task Manager's off state is an odd first byte", () => {
	const query = (bytes: string) =>
		`\r\nHKEY_CURRENT_USER\\...\\StartupApproved\\Run\r\n    Clipa    REG_BINARY    ${bytes}\r\n`;
	expect(approvedOff(query("020000000000000000000000"))).toBe(false);
	expect(approvedOff(query("060000000000000000000000"))).toBe(false);
	expect(approvedOff(query("0300000066AF9C7C5A46D901"))).toBe(true);
	expect(approvedOff("")).toBe(false);
});

onWindows("the Windows calls answer", () => {
	const { tracker, system } = loadWindows({
		own: { key: "dev.clipa.app", name: "Clipa" },
		launcher: "C:\\none\\launcher.exe",
		loginName: "Clipa test",
	});
	expect(() => tracker.frontmostApp()).not.toThrow();
	expect(() => tracker.focusedWindowTitle()).not.toThrow();
	const idle = tracker.idleSeconds();
	expect(Number.isFinite(idle) && idle >= 0).toBe(true);
	expect(system.launchAtLogin()).toBe("unavailable");
});

onWindows("a program's description comes from its version resource", () => {
	const libs = openWindowsLibs();
	const windows = process.env.SystemRoot ?? "C:\\Windows";
	expect(programDescription(libs, `${windows}\\explorer.exe`)).toBeTruthy();
	expect(programDescription(libs, `${windows}\\System32\\notepad.exe`)).toBeTruthy();
	expect(programDescription(libs, `${windows}\\no-such-program.exe`)).toBeNull();
});

onWindows("launch at login writes and removes a Run value", () => {
	const item = runKeyItem("Clipa CI test", "C:\\Users\\Some One\\AppData\\Local\\dev.clipa.app\\stable\\app\\bin\\launcher.exe");
	item.set(false);
	expect(item.get()).toBe("off");
	item.set(true);
	expect(item.get()).toBe("on");
	const value = Bun.spawnSync([
		"reg",
		"query",
		"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
		"/v",
		"Clipa CI test",
	]).stdout.toString();
	expect(value).toContain('"C:\\Users\\Some One\\AppData\\Local\\dev.clipa.app\\stable\\app\\bin\\launcher.exe"');
	item.set(false);
	expect(item.get()).toBe("off");
});
