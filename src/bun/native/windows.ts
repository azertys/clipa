// Windows calls through Bun FFI into the system DLLs (user32, kernel32, version), so there is no
// library to build. Launch at login is a value in the user's Run key.
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { LaunchAtLogin, NativeSystem, NativeTracker, OwnApp } from "./tracker";

const { ptr: pointer, i32, u32 } = FFIType;

const user32 = {
	GetForegroundWindow: { args: [], returns: pointer },
	GetWindowThreadProcessId: { args: [pointer, pointer], returns: u32 },
	GetWindowTextW: { args: [pointer, pointer, i32], returns: i32 },
	FindWindowExW: { args: [pointer, pointer, pointer, pointer], returns: pointer },
	GetLastInputInfo: { args: [pointer], returns: i32 },
} as const;

const kernel32 = {
	OpenProcess: { args: [u32, i32, u32], returns: pointer },
	QueryFullProcessImageNameW: { args: [pointer, u32, pointer, pointer], returns: i32 },
	CloseHandle: { args: [pointer], returns: i32 },
	GetTickCount: { args: [], returns: u32 },
} as const;

const version = {
	GetFileVersionInfoSizeW: { args: [pointer, pointer], returns: u32 },
	GetFileVersionInfoW: { args: [pointer, u32, u32, pointer], returns: i32 },
	VerQueryValueW: { args: [pointer, pointer, pointer, pointer], returns: i32 },
} as const;

/** A window or process handle as Bun returns it. */
type Handle = Pointer | bigint;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** Longer titles are cut. GetWindowTextW reads another program's title without waiting for it. */
const TITLE_CHARS = 512;
/** Store apps run in a frame of this program; the app is a child window of another process. */
const FRAME_HOST = "applicationframehost.exe";

const wide = (text: string) => Buffer.from(`${text}\0`, "utf16le");
const fromWide = (chars: Uint16Array, length: number) =>
	Buffer.from(chars.buffer, chars.byteOffset, length * 2).toString("utf16le");

export type WindowsLibs = ReturnType<typeof openWindowsLibs>;

export function openWindowsLibs() {
	return {
		user: dlopen("user32.dll", user32).symbols,
		kernel: dlopen("kernel32.dll", kernel32).symbols,
		version: dlopen("version.dll", version).symbols,
	};
}

/** The program file of a process, or null when Windows does not allow it (protected processes). */
function programPath(libs: WindowsLibs, pid: number): string | null {
	const handle = libs.kernel.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
	if (!handle) return null;
	try {
		const path = new Uint16Array(1024);
		const size = new Uint32Array([path.length]);
		return libs.kernel.QueryFullProcessImageNameW(handle, 0, path, size) ? fromWide(path, size[0]) : null;
	} finally {
		libs.kernel.CloseHandle(handle);
	}
}

function processOf(libs: WindowsLibs, window: Handle): number {
	const pid = new Uint32Array(1);
	libs.user.GetWindowThreadProcessId(window, pid);
	return pid[0];
}

/** The FileDescription of a program ("Google Chrome" for chrome.exe), or null. */
export function programDescription(libs: WindowsLibs, path: string): string | null {
	const file = wide(path);
	const size = libs.version.GetFileVersionInfoSizeW(file, null);
	if (!size) return null;
	const block = new Uint8Array(size);
	if (!libs.version.GetFileVersionInfoW(file, 0, size, block)) return null;
	const start = ptr(block);
	const found = new BigUint64Array(1);
	const length = new Uint32Array(1);
	// A value inside the block: its offset and length (in characters for strings).
	const query = (name: string) => {
		if (!libs.version.VerQueryValueW(block, wide(name), found, length) || !length[0]) return null;
		const offset = Number(found[0]) - start;
		return offset >= 0 && offset < size ? { offset, length: length[0] } : null;
	};
	// The languages of the file, then US English in Unicode and in Windows-1252.
	const languages: string[] = [];
	const translation = query("\\VarFileInfo\\Translation");
	if (translation) {
		const bytes = block.subarray(translation.offset, translation.offset + translation.length);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const hex = (n: number) => n.toString(16).padStart(4, "0");
		for (let i = 0; i + 4 <= view.byteLength; i += 4) {
			languages.push(hex(view.getUint16(i, true)) + hex(view.getUint16(i + 2, true)));
		}
	}
	languages.push("040904b0", "040904e4");
	for (const language of languages) {
		const value = query(`\\StringFileInfo\\${language}\\FileDescription`);
		if (!value) continue;
		const chars = block.subarray(value.offset, value.offset + value.length * 2);
		const text = Buffer.from(chars).toString("utf16le").split("\0")[0].trim();
		if (text) return text;
	}
	return null;
}

/** "chrome.exe" for "C:\...\chrome.exe": the key stays the same when a program moves to a new version folder. */
export function programKey(path: string): string {
	return basename(path.replaceAll("\\", "/")).toLowerCase();
}

/** "Code" for "C:\...\Code.exe", when the program has no description. */
export function programName(path: string): string {
	return basename(path.replaceAll("\\", "/")).replace(/\.exe$/i, "");
}

export type WindowsOptions = {
	own: OwnApp;
	/** bin/launcher.exe, which starts Clipa. */
	launcher: string;
	/** The name of the Run value: one per channel. */
	loginName: string;
};

export function loadWindows({ own, launcher, loginName }: WindowsOptions): { tracker: NativeTracker; system: NativeSystem } {
	const libs = openWindowsLibs();
	// The sampler asks every second; the description is read once per program.
	const names = new Map<string, { key: string; name: string }>();

	function appOfWindow(window: Handle): { key: string; name: string } | null {
		let pid = processOf(libs, window);
		if (!pid) return null;
		if (pid === process.pid) return own;
		let path = programPath(libs, pid);
		if (path && programKey(path) === FRAME_HOST) {
			// A Store app: its own window is a child of the frame, in another process.
			for (let child = libs.user.FindWindowExW(window, null, null, null); child; ) {
				const childPid = processOf(libs, child);
				if (childPid && childPid !== pid) {
					pid = childPid;
					path = programPath(libs, pid) ?? path;
					break;
				}
				child = libs.user.FindWindowExW(window, child, null, null);
			}
		}
		if (!path) return null;
		let app = names.get(path);
		if (!app) {
			app = { key: programKey(path), name: programDescription(libs, path) ?? programName(path) };
			names.set(path, app);
		}
		return app;
	}

	const tracker: NativeTracker = {
		frontmostApp() {
			const window = libs.user.GetForegroundWindow();
			return window ? appOfWindow(window) : null;
		},
		focusedWindowTitle() {
			const window = libs.user.GetForegroundWindow();
			if (!window) return null;
			const title = new Uint16Array(TITLE_CHARS);
			const length = libs.user.GetWindowTextW(window, title, TITLE_CHARS);
			return length > 0 ? fromWide(title, length) : null;
		},
		idleSeconds() {
			// LASTINPUTINFO: cbSize, then the tick count of the last input.
			const info = new Uint32Array([8, 0]);
			if (!libs.user.GetLastInputInfo(info)) return 0;
			// The tick count wraps after 49.7 days; the difference stays right.
			return ((libs.kernel.GetTickCount() - info[1]) >>> 0) / 1000;
		},
		measuresIdle: () => true,
		// Windows needs no permission for window titles.
		hasTitlePermission: () => true,
		requestTitlePermission: () => {},
	};

	const login = runKeyItem(loginName, launcher);
	const system: NativeSystem = {
		launchAtLogin: () => (existsSync(launcher) ? login.get() : "unavailable"),
		setLaunchAtLogin(on) {
			if (!existsSync(launcher)) return "unavailable";
			login.set(on);
			return login.get();
		},
		// The tray menu gives Clipa the right to come to the front; the quit question opens there.
		activate: () => {},
	};
	return { tracker, system };
}

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/** Task Manager's Startup apps page turns an item off here, without removing it from Run. */
const APPROVED_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";

function reg(args: string[]) {
	const result = Bun.spawnSync(["reg", ...args], { windowsHide: true });
	return { ok: result.exitCode === 0, output: result.stdout.toString() };
}

/** In StartupApproved, an odd first byte means that the user turned the item off. */
export function approvedOff(queryOutput: string): boolean {
	const match = /REG_BINARY\s+([0-9A-F]{2})/i.exec(queryOutput);
	return match !== null && (parseInt(match[1], 16) & 1) === 1;
}

/** The value `name` in the Run key starts `program` at login. */
export function runKeyItem(name: string, program: string) {
	return {
		get(): LaunchAtLogin {
			if (!reg(["query", RUN_KEY, "/v", name]).ok) return "off";
			const approved = reg(["query", APPROVED_KEY, "/v", name]);
			return approved.ok && approvedOff(approved.output) ? "approval" : "on";
		},
		set(on: boolean): void {
			// Quotes, because the path can have spaces (the user's folder name).
			if (on) reg(["add", RUN_KEY, "/v", name, "/t", "REG_SZ", "/d", `"${program}"`, "/f"]);
			else reg(["delete", RUN_KEY, "/v", name, "/f"]);
		},
	};
}
