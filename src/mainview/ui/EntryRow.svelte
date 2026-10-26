<script lang="ts">
	import { firstLine } from "../../../core/entries";
	import { formatDuration } from "../../../core/time";
	import type { EntryWithTags, Tag } from "../../../core/types";
	import { app, clockRange } from "../lib/app.svelte";
	import { strings } from "../strings";
	import IconButton from "./IconButton.svelte";
	import TagChip from "./TagChip.svelte";

	let {
		entry,
		now,
		overlap = false,
		action = "continue",
		onopen,
		oncontinue,
		onmore,
	}: {
		entry: EntryWithTags;
		/** The end of a running entry */
		now: number;
		/** Shows a warning: the entry shares time with another one */
		overlap?: boolean;
		/** Trailing button: ▶ continue (Today) or ⋯ more (Entries) */
		action?: "continue" | "more" | "none";
		/** Click on the row body, for example to edit */
		onopen?: (entry: EntryWithTags) => void;
		oncontinue?: (entry: EntryWithTags) => void;
		onmore?: (entry: EntryWithTags, anchor: HTMLElement) => void;
	} = $props();

	const tags = $derived(entry.tagIds.map((id) => app.tagById.get(id)).filter((t): t is Tag => !!t));
	const note = $derived(firstLine(entry.note));
</script>

<div class="row">
	<button class="body" type="button" onclick={() => onopen?.(entry)} disabled={!onopen}>
		<span class="time clipa-num">{clockRange(entry.started_at, entry.ended_at)}</span>
		<span class="note" class:empty={!note}>
			{#if overlap}<span class="warn" title={strings.entries.overlap}>⚠︎</span>{/if}
			{note || strings.common.noNote}
		</span>
		{#if tags.length}
			<span class="tags">
				{#each tags as tag (tag.id)}<TagChip {tag} />{/each}
			</span>
		{/if}
		<span class="dur clipa-num">{formatDuration((entry.ended_at ?? now) - entry.started_at)}</span>
	</button>
	{#if action === "continue"}
		<IconButton icon="play" label={strings.timer.continueEntry} iconSize={13} onclick={() => oncontinue?.(entry)} />
	{:else if action === "more"}
		<IconButton icon="more" label={strings.entries.more} iconSize={16} onclick={(e) => onmore?.(entry, e.currentTarget)} />
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 6px 8px 6px 0;
		border-top: 1px solid var(--clipa-divider);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 36px;
		padding: 0 8px 0 16px;
		border: 0;
		border-radius: var(--clipa-r);
		background: transparent;
		text-align: left;
	}
	.body:not(:disabled):hover {
		background: var(--clipa-row-hover);
	}
	.time {
		width: 104px;
		flex: none;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.note {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.note.empty {
		color: var(--clipa-faint);
		font-style: italic;
	}
	.warn {
		color: var(--clipa-event);
		font-style: normal;
		margin-right: 4px;
	}
	.tags {
		display: inline-flex;
		gap: 6px;
		flex: none;
	}
	.dur {
		width: 44px;
		flex: none;
		text-align: right;
		font-size: 14px;
		font-weight: 600;
	}
</style>
