// One Clipa per user and channel. macOS starts an app once and sends "reopen" (index.ts). On
// Windows and Linux the first Clipa listens on a named pipe or a socket file; a second start
// asks it to show its window, then quits.
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { createConnection, createServer, type Server } from "node:net";
import { posix } from "node:path";
import type { Platform } from "../../shared/platform";

/** A named pipe on Windows (one name per data folder), a socket file in the data folder elsewhere. */
export function instanceAddress(platform: Platform, userData: string): string {
	if (platform !== "windows") return posix.join(userData, "clipa.sock");
	const id = createHash("sha256").update(userData.toLowerCase()).digest("hex").slice(0, 16);
	return `\\\\.\\pipe\\clipa-${id}`;
}

function listen(address: string, onShow: () => void): Promise<Server | null> {
	return new Promise((resolve, reject) => {
		const server = createServer((socket) => {
			socket.on("error", () => {});
			socket.once("data", () => {
				socket.end();
				onShow();
			});
		});
		server.once("error", (error: NodeJS.ErrnoException) => (error.code === "EADDRINUSE" ? resolve(null) : reject(error)));
		server.listen(address, () => resolve(server));
	});
}

/** Asks the Clipa at `address` to show its window. False when none answers. */
function knock(address: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection(address, () => socket.end("show\n", () => resolve(true)));
		socket.once("error", () => resolve(false));
	});
}

/**
 * True when this process is the only Clipa: it then calls `onShow` when another start asks for
 * the window. False when another Clipa runs; it has been asked to show its window.
 */
export async function claimInstance(address: string, onShow: () => void): Promise<boolean> {
	if (await listen(address, onShow)) return true;
	if (await knock(address)) return false;
	// Nobody answers: a socket file left by a Clipa that crashed. Windows removes a pipe with its process.
	if (!address.startsWith("\\\\.\\pipe\\")) rmSync(address, { force: true });
	// Clipa starts also when this fails; only a second start would then not find it.
	await listen(address, onShow);
	return true;
}
