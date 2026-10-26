<script lang="ts">
	import type { ImportSummary } from "../../../core/backup";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";

	// The result of an import (spec section 9: rows added, updated, skipped). Esc closes it.
	let { summary, onclose }: { summary: ImportSummary; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (!dialog.open) dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	aria-labelledby="import-title"
>
	<h2 id="import-title">{strings.dialogs.importTitle}</h2>
	<p>{strings.dialogs.importCounts(summary.added, summary.updated, summary.skipped)}</p>
	{#if summary.mergedTags > 0}<p>{strings.dialogs.importMerged(summary.mergedTags)}</p>{/if}
	{#if summary.closedEntries > 0}<p>{strings.dialogs.importClosed(summary.closedEntries)}</p>{/if}
	<p class="copy">{strings.dialogs.importCopy(summary.backupPath)}</p>
	<footer>
		<!-- svelte-ignore a11y_autofocus -->
		<Button variant="primary" onclick={onclose} autofocus>{strings.common.ok}</Button>
	</footer>
</dialog>

<style>
	dialog {
		width: 420px;
	}
	p + p {
		margin-top: 8px;
	}
	.copy {
		color: var(--clipa-muted);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
</style>
