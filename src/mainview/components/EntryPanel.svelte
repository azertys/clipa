<script lang="ts">
	import { untrack } from "svelte";
	import { formatDuration, fromLocalInput, MINUTE, toLocalInput } from "../../../core/time";
	import type { EntryWithTags } from "../../../core/types";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import TagCombobox from "./TagCombobox.svelte";

	let { entryId, onclose }: { entryId: string; onclose: () => void } = $props();

	let entry = $state<EntryWithTags | null>(null);
	let start = $state("");
	let end = $state("");
	let note = $state("");
	let tagIds = $state<string[]>([]);
	let confirmDelete = $state(false);
	let loaded = $state(false);

	const isNew = $derived(entryId === "new");
	const isRunning = $derived(entry !== null && entry.ended_at === null);
	const startMs = $derived(fromLocalInput(start, tz));
	const endMs = $derived(isRunning ? app.now : fromLocalInput(end, tz));

	$effect(() => {
		const id = entryId;
		untrack(() => void load(id));
	});

	async function load(id: string) {
		loaded = false;
		confirmDelete = false;
		app.error = null;
		if (id === "new") {
			const endAt = Math.floor(Date.now() / MINUTE) * MINUTE;
			entry = null;
			start = toLocalInput(endAt - 30 * MINUTE, tz);
			end = toLocalInput(endAt, tz);
			note = "";
			tagIds = [...app.settings.defaultTagIds];
		} else {
			entry = await api.entriesGet({ id });
			if (!entry) return onclose();
			start = toLocalInput(entry.started_at, tz);
			end = entry.ended_at === null ? "" : toLocalInput(entry.ended_at, tz);
			note = entry.note;
			tagIds = [...entry.tagIds];
		}
		loaded = true;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (startMs === null || (!isRunning && endMs === null)) return;
		const saved = await app.attempt(() =>
			api.entriesUpsert({
				id: entry?.id,
				started_at: startMs,
				ended_at: isRunning ? null : endMs,
				note,
				tagIds,
			}),
		);
		if (!saved) return;
		if (isRunning) app.setRunning(saved, true);
		app.revision++;
		onclose();
	}

	async function remove() {
		if (!entry) return;
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		const done = await app.attempt(() => api.entriesDelete({ id: entry!.id }));
		if (!done) return;
		app.revision++;
		onclose();
	}
</script>

<aside class="panel" aria-label={isNew ? strings.panel.newTitle : strings.panel.editTitle}>
	<header>
		<h2>{isNew ? strings.panel.newTitle : strings.panel.editTitle}</h2>
		<button class="ghost" onclick={onclose} aria-label={strings.panel.cancel}>×</button>
	</header>
	{#if loaded}
		<form onsubmit={save}>
			<label>
				{strings.panel.start}
				<input type="datetime-local" bind:value={start} required />
			</label>
			<label>
				{strings.panel.end}
				<input type="datetime-local" bind:value={end} required={!isRunning} disabled={isRunning} />
			</label>
			{#if isRunning}<p class="hint">{strings.panel.runningHint}</p>{/if}
			{#if startMs !== null && endMs !== null && endMs > startMs}
				<p class="hint">{formatDuration(endMs - startMs)}</p>
			{/if}
			<label>
				{strings.panel.note}
				<textarea rows="6" bind:value={note}></textarea>
			</label>
			<div class="field">
				<span>{strings.panel.tags}</span>
				<TagCombobox bind:selected={tagIds} />
			</div>
			<footer>
				{#if !isNew}
					<button type="button" class="danger" onclick={remove}>
						{confirmDelete ? strings.panel.confirmDelete : strings.panel.delete}
					</button>
				{/if}
				<span class="spacer"></span>
				<button type="button" onclick={onclose}>{strings.panel.cancel}</button>
				<button type="submit" class="primary">{strings.panel.save}</button>
			</footer>
		</form>
	{/if}
</aside>

<style>
	.panel {
		width: 340px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
		padding: 16px;
		overflow-y: auto;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}
	form {
		display: grid;
		gap: 12px;
	}
	label,
	.field {
		display: grid;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
	}
	label > :global(*),
	.field > :global(:not(span)) {
		color: var(--text);
		font-size: 13px;
	}
	.hint {
		margin: -6px 0 0;
		font-size: 12px;
		color: var(--muted);
	}
	footer {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.spacer {
		flex: 1;
	}
</style>
