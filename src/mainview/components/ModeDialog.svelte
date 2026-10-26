<script lang="ts">
	import type { EditMode } from "../../../core/types";
	import type { ModeRequest } from "../lib/calendar";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";

	let { request, onchoose }: { request: ModeRequest; onchoose: (mode: EditMode | null) => void } = $props();

	const modes: EditMode[] = ["this", "following", "all"];

	let dialog: HTMLDialogElement;
	let mode = $state<EditMode>("this");

	$effect(() => {
		mode = request.allowThis ? "this" : "following";
		if (!dialog.open) dialog.showModal();
	});

	function cancel(e?: Event) {
		e?.preventDefault();
		onchoose(null);
	}
</script>

<dialog bind:this={dialog} oncancel={cancel} aria-labelledby="mode-title">
	<h2 id="mode-title">{request.kind === "edit" ? strings.mode.editTitle : strings.mode.deleteTitle}</h2>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			onchoose(mode);
		}}
	>
		<fieldset>
			{#each modes as m (m)}
				<label class:disabled={m === "this" && !request.allowThis}>
					<input type="radio" name="mode" value={m} bind:group={mode} disabled={m === "this" && !request.allowThis} />
					{strings.mode[m]}
				</label>
			{/each}
		</fieldset>
		{#if !request.allowThis}<p class="muted">{strings.mode.thisDisabled}</p>{/if}
		{#if request.warnings[mode]}<p class="warn">{request.warnings[mode]}</p>{/if}
		<footer>
			<Button variant="secondary" onclick={() => cancel()}>{strings.mode.cancel}</Button>
			<Button type="submit" variant="primary">{strings.mode.ok}</Button>
		</footer>
	</form>
</dialog>

<style>
	dialog {
		width: 360px;
	}
	fieldset {
		display: grid;
		gap: 8px;
		margin: 12px 0 0;
		padding: 0;
		border: none;
	}
	label {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	label.disabled {
		color: var(--clipa-faint);
	}
	p {
		margin: 10px 0 0;
		font-size: 12px;
	}
	.warn {
		color: var(--clipa-event-soft);
	}
</style>
