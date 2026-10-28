// Xlib through Bun FFI: the active window with its class, process and title (EWMH), and the idle
// time (the MIT-SCREEN-SAVER extension, libXss). Only for X11 sessions: on Wayland, XWayland sees
// only X11 windows and X11 input.
import { dlopen, FFIType, toArrayBuffer, type Pointer } from "bun:ffi";

const { ptr: pointer, i32, i64, u64, u64_fast } = FFIType;

const xlib = {
	XOpenDisplay: { args: [pointer], returns: pointer },
	XDefaultRootWindow: { args: [pointer], returns: u64_fast },
	XInternAtom: { args: [pointer, pointer, i32], returns: u64_fast },
	XGetWindowProperty: {
		args: [pointer, u64, u64, i64, i64, i32, u64, pointer, pointer, pointer, pointer, pointer],
		returns: i32,
	},
	XFree: { args: [pointer], returns: i32 },
} as const;

const xss = {
	XScreenSaverQueryExtension: { args: [pointer, pointer, pointer], returns: i32 },
	XScreenSaverQueryInfo: { args: [pointer, u64, pointer], returns: i32 },
} as const;

/** The longest property read, in 32-bit units: 16 KB of title. */
const MAX_LONGS = 4096;
/** XScreenSaverInfo: window, state, kind, til_or_since, idle (ms, at byte 24), eventMask. */
const IDLE_OFFSET = 24;

export type X11Window = { pid: number | null; classes: string[]; title: string | null };

export type X11 = {
	activeWindow(): X11Window | null;
	/** Milliseconds since the last input, or null without libXss. */
	idleMs(): number | null;
};

const cString = (value: string) => Buffer.from(`${value}\0`, "utf8");

/**
 * COMPOUND_TEXT, which older programs (xterm) use for their title: Latin-1, with UTF-8 between
 * ESC % G and ESC % @. Other ISO 2022 escapes are dropped.
 */
export function compoundText(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("latin1")
		.replace(/\x1b%G([\s\S]*?)(?:\x1b%@|$)/g, (_, utf8: string) => Buffer.from(utf8, "latin1").toString("utf8"))
		.replace(/\x1b[\x20-\x2f]*[\x30-\x7e]/g, "");
}

/** Opens the display of $DISPLAY. Throws when libX11 is missing; null without a display. */
export function openX11(): X11 | null {
	const x = dlopen("libX11.so.6", xlib).symbols;
	const display = x.XOpenDisplay(null);
	if (!display) return null;
	const root = Number(x.XDefaultRootWindow(display));
	let saver: ReturnType<typeof dlopen<typeof xss>>["symbols"] | null = null;
	try {
		saver = dlopen("libXss.so.1", xss).symbols;
		if (!saver.XScreenSaverQueryExtension(display, new Int32Array(1), new Int32Array(1))) saver = null;
	} catch {
		saver = null;
	}

	const atoms = new Map<string, number>();
	const atom = (name: string) => {
		let value = atoms.get(name);
		if (value === undefined) {
			value = Number(x.XInternAtom(display, cString(name), 0));
			atoms.set(name, value);
		}
		return value;
	};

	/** A property's bytes. Format 32 items are C longs: 8 bytes each on 64-bit systems. */
	function property(window: number, name: string): { type: number; format: number; bytes: Uint8Array } | null {
		const type = new BigUint64Array(1);
		const format = new Int32Array(1);
		const items = new BigUint64Array(1);
		const after = new BigUint64Array(1);
		const data = new BigUint64Array(1);
		// AnyPropertyType (0). A window closed a moment ago gives an error status, and no data.
		const status = x.XGetWindowProperty(display, window, atom(name), 0, MAX_LONGS, 0, 0, type, format, items, after, data);
		const at = Number(data[0]);
		if (!at) return null;
		try {
			const size = format[0] === 32 ? 8 : format[0] / 8;
			const count = Number(items[0]);
			if (status !== 0 || !size || !count) return null;
			const bytes = new Uint8Array(toArrayBuffer(at as Pointer, 0, count * size)).slice();
			return { type: Number(type[0]), format: format[0], bytes };
		} finally {
			x.XFree(at as Pointer);
		}
	}

	const long = (window: number, name: string) => {
		const value = property(window, name);
		return value?.format === 32 ? Number(new DataView(value.bytes.buffer).getBigUint64(0, true)) : null;
	};
	/** A text property: UTF8_STRING, COMPOUND_TEXT, or STRING (Latin-1). */
	const string = (window: number, name: string) => {
		const value = property(window, name);
		if (value?.format !== 8) return null;
		const text =
			value.type === atom("UTF8_STRING")
				? Buffer.from(value.bytes).toString("utf8")
				: value.type === atom("COMPOUND_TEXT")
					? compoundText(value.bytes)
					: Buffer.from(value.bytes).toString("latin1");
		return text.replace(/\0+$/, "");
	};

	return {
		activeWindow() {
			const window = long(root, "_NET_ACTIVE_WINDOW");
			if (!window) return null;
			// WM_CLASS is "instance\0class\0"; the class comes first in the list.
			const [instance = "", cls = ""] = (string(window, "WM_CLASS") ?? "").split("\0");
			return {
				pid: long(window, "_NET_WM_PID"),
				classes: [cls, instance].filter(Boolean),
				title: string(window, "_NET_WM_NAME") ?? string(window, "WM_NAME"),
			};
		},
		idleMs() {
			if (!saver) return null;
			const info = new Uint8Array(64);
			if (!saver.XScreenSaverQueryInfo(display, root, info)) return null;
			return Number(new DataView(info.buffer).getBigUint64(IDLE_OFFSET, true));
		},
	};
}
