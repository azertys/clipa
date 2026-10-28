<script lang="ts">
	import { onMount } from "svelte";
	import { MINUTE } from "../../core/time";
	import type { IdleAction, IdlePrompt } from "../shared/rpc-schema";
	import { app, clock } from "./lib/app.svelte";
	import { api, send } from "./lib/rpc";
	import { strings } from "./strings";
	import Button from "./ui/Button.svelte";

	// The idle question in a small window of its own, on top of other apps.
	// Esc keeps the time, like Keep; so does closing the window (index.ts).
	let prompt = $state<IdlePrompt | null>(null);
	let busy = $state(false);

	onMount(async () => {
		const [settings, question] = await Promise.all([api.settingsGet({}), api.idleQuestion({})]);
		app.settings = settings;
		if (question) prompt = question;
		else send.windowClose({});
	});

	async function answer(action: IdleAction) {
		if (busy || !prompt) return;
		const id = prompt.id;
		busy = true;
		const done = await app.attempt(() => api.idleResolve({ id, action }));
		busy = false;
		if (done !== undefined) send.windowClose({});
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== "Escape") return;
		e.preventDefault();
		void answer("keep");
	}
</script>

<!-- No context menu: the webview's own has Inspect Element. -->
<svelte:window {onkeydown} oncontextmenu={(e) => e.preventDefault()} />

<main class="idle" aria-labelledby="idle-title">
	{#if prompt}
		<h1 id="idle-title">{strings.idle.title}</h1>
		<p>
			{strings.idle.message(clock(prompt.start), clock(prompt.end), Math.round((prompt.end - prompt.start) / MINUTE))}
		</p>
		{#if app.error}<p class="error" role="alert">{app.error}</p>{/if}
		<footer>
			<Button variant="danger" onclick={() => answer("discardStop")} disabled={busy}>{strings.idle.discardStop}</Button>
			<span class="spacer"></span>
			<Button variant="secondary" onclick={() => answer("discard")} disabled={busy}>{strings.idle.discard}</Button>
			<!-- svelte-ignore a11y_autofocus -->
			<Button variant="primary" onclick={() => answer("keep")} disabled={busy} autofocus>{strings.idle.keep}</Button>
		</footer>
	{/if}
</main>

<style>
	.idle {
		box-sizing: border-box;
		height: 100%;
		padding: 20px;
		background: var(--clipa-surface);
		color: var(--clipa-text);
	}
	h1 {
		margin: 0 0 6px;
		font-size: 16px;
		font-weight: 650;
	}
	p {
		margin: 0;
		font-size: 13px;
		color: var(--clipa-text-2);
	}
	.error {
		margin-top: 8px;
		color: var(--clipa-danger-text);
	}
	footer {
		display: flex;
		gap: 8px;
		margin-top: 18px;
	}
	.spacer {
		flex: 1;
	}
</style>
