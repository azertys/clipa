// D-Bus calls on the session bus through GIO (Bun FFI), for Wayland. GTK already loads GIO.
// GNOME gives the idle time (Mutter's idle monitor). The active window needs the GNOME Shell
// extension "Focused Window D-Bus" (extensions.gnome.org/extension/5592).
import { dlopen, FFIType, type Pointer } from "bun:ffi";

const { ptr: pointer, i32, u64, cstring, void: none } = FFIType;

const gio = {
	g_bus_get_sync: { args: [i32, pointer, pointer], returns: pointer },
	g_dbus_connection_call_sync: {
		args: [pointer, pointer, pointer, pointer, pointer, pointer, pointer, i32, i32, pointer, pointer],
		returns: pointer,
	},
} as const;

const glib = {
	g_variant_get_type_string: { args: [pointer], returns: cstring },
	g_variant_get_child_value: { args: [pointer, u64], returns: pointer },
	g_variant_get_uint64: { args: [pointer], returns: u64 },
	g_variant_get_string: { args: [pointer, pointer], returns: cstring },
	g_variant_unref: { args: [pointer], returns: none },
	g_error_free: { args: [pointer], returns: none },
} as const;

const G_BUS_TYPE_SESSION = 2;
/** A missing service is not started for the call. */
const G_DBUS_CALL_FLAGS_NO_AUTO_START = 1;
/** The calls run on Clipa's event loop: a busy desktop must not hold it for long. */
const TIMEOUT_MS = 500;

const text = (value: string) => Buffer.from(`${value}\0`, "utf8");

/** One method call, without arguments. */
type Method = { dest: Buffer; path: Buffer; iface: Buffer; name: Buffer };
const method = (dest: string, path: string, iface: string, name: string): Method => ({
	dest: text(dest),
	path: text(path),
	iface: text(iface),
	name: text(name),
});

const MUTTER_IDLE = method(
	"org.gnome.Mutter.IdleMonitor",
	"/org/gnome/Mutter/IdleMonitor/Core",
	"org.gnome.Mutter.IdleMonitor",
	"GetIdletime",
);
const FOCUSED_WINDOW = method(
	"org.gnome.Shell",
	"/org/gnome/shell/extensions/FocusedWindow",
	"org.gnome.shell.extensions.FocusedWindow",
	"Get",
);

export type BusWindow = { pid: number | null; classes: string[]; title: string | null };

export type SessionBus = {
	/** Milliseconds since the last input (GNOME), or null. */
	idleMs(): number | null;
	/** The focused window from the GNOME Shell extension, or null without it. */
	focusedWindow(): BusWindow | null;
};

/** The extension's JSON. A desktop without a focused window gives {}. */
export function parseFocusedWindow(json: string): BusWindow | null {
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(json);
	} catch {
		return null;
	}
	const str = (value: unknown) => (typeof value === "string" && value ? value : null);
	const classes = [str(data.wm_class), str(data.wm_class_instance)].filter((c): c is string => c !== null);
	if (classes.length === 0) return null;
	return { pid: typeof data.pid === "number" && data.pid > 0 ? data.pid : null, classes, title: str(data.title) };
}

/** Connects to the session bus. Throws when GIO is missing; null without a session bus. */
export function openSessionBus(): SessionBus | null {
	const g = dlopen("libgio-2.0.so.0", gio).symbols;
	const v = dlopen("libglib-2.0.so.0", glib).symbols;
	const error = new BigUint64Array(1);
	const bus = g.g_bus_get_sync(G_BUS_TYPE_SESSION, null, error);
	if (!bus) {
		if (error[0]) v.g_error_free(Number(error[0]) as Pointer);
		return null;
	}

	/** The reply's first value when it has the type `type` ("t", "s"), or null. */
	function call<T>(m: Method, type: string, read: (value: Pointer) => T): T | null {
		error[0] = 0n;
		const reply = g.g_dbus_connection_call_sync(bus, m.dest, m.path, m.iface, m.name, null, null,
			G_DBUS_CALL_FLAGS_NO_AUTO_START, TIMEOUT_MS, null, error);
		if (!reply) {
			// No such service or method: the extension is not installed, or this is not GNOME.
			if (error[0]) v.g_error_free(Number(error[0]) as Pointer);
			return null;
		}
		try {
			if (String(v.g_variant_get_type_string(reply)) !== `(${type})`) return null;
			const value = v.g_variant_get_child_value(reply, 0);
			if (!value) return null;
			try {
				return read(value as Pointer);
			} finally {
				v.g_variant_unref(value);
			}
		} finally {
			v.g_variant_unref(reply);
		}
	}

	return {
		idleMs: () => call(MUTTER_IDLE, "t", (value) => Number(v.g_variant_get_uint64(value))),
		focusedWindow() {
			const json = call(FOCUSED_WINDOW, "s", (value) => String(v.g_variant_get_string(value, null) ?? ""));
			return json ? parseFocusedWindow(json) : null;
		},
	};
}
