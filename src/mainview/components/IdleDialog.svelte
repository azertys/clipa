<script lang="ts">
	import { MINUTE } from "../../../core/time";
	import type { IdleAction, IdlePrompt } from "../../shared/rpc-schema";
	import { app, clock } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";

	// The idle question (spec section 5). It is in the window because a native dialog would
	// block the main process (D11). Esc keeps the time, like Keep.
	let { prompt, onclose }: { prompt: IdlePrompt; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;
	let busy = $state(false);

	$effect(() => {
		if (!dialog.open) dialog.showModal();
	});

	async function answer(action: IdleAction) {
		if (busy) return;
		busy = true;
		const done = await app.attempt(() => api.idleResolve({ id: prompt.id, action }));
		busy = false;
		if (done === undefined) return;
		onclose();
		app.revision++;
	}
</script>

<dialog
	bind:this={dialog}
	oncancel={(e) => {
		e.preventDefault();
		void answer("keep");
	}}
	aria-labelledby="idle-title"
>
	<h2 id="idle-title">{strings.idle.title}</h2>
	<p>
		{strings.idle.message(clock(prompt.start), clock(prompt.end), Math.round((prompt.end - prompt.start) / MINUTE))}
	</p>
	<footer>
		<Button variant="danger" onclick={() => answer("discardStop")} disabled={busy}>{strings.idle.discardStop}</Button>
		<span class="spacer"></span>
		<Button variant="secondary" onclick={() => answer("discard")} disabled={busy}>{strings.idle.discard}</Button>
		<!-- svelte-ignore a11y_autofocus -->
		<Button variant="primary" onclick={() => answer("keep")} disabled={busy} autofocus>{strings.idle.keep}</Button>
	</footer>
</dialog>

<style>
	dialog {
		width: 440px;
	}
	.spacer {
		flex: 1;
	}
</style>
