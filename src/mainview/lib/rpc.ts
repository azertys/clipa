import { Electroview } from "electrobun/view";
import type { ClipaRPC } from "../../shared/rpc-schema";

type Messages = ClipaRPC["webview"]["messages"];
type Listener<K extends keyof Messages> = (payload: Messages[K]) => void;

const listeners = new Map<keyof Messages, Set<(payload: never) => void>>();

function emit<K extends keyof Messages>(name: K, payload: Messages[K]) {
	listeners.get(name)?.forEach((fn) => (fn as Listener<K>)(payload));
}

/** Subscribes to a message from the main process. Returns the unsubscribe function. */
export function onMessage<K extends keyof Messages>(name: K, fn: Listener<K>): () => void {
	if (!listeners.has(name)) listeners.set(name, new Set());
	const set = listeners.get(name)!;
	set.add(fn);
	return () => set.delete(fn);
}

export const rpc = Electroview.defineRPC<ClipaRPC>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {},
		messages: {
			timerChanged: (p) => emit("timerChanged", p),
			dataChanged: (p) => emit("dataChanged", p),
			navigate: (p) => emit("navigate", p),
			updateFailed: (p) => emit("updateFailed", p),
		},
	},
});

new Electroview({ rpc });

/** Requests to the main process. */
export const api = rpc.request;

/** Messages to the main process, without an answer. */
export const send = rpc.send;
