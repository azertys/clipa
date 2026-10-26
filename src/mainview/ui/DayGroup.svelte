<script lang="ts">
	import type { Snippet } from "svelte";
	import { formatDuration } from "../../../core/time";
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";

	let {
		title,
		badge,
		count,
		totalMs,
		open,
		ontoggle,
		children,
	}: {
		/** "Monday, 26 October" */
		title: string;
		/** For example "Today" */
		badge?: string;
		count: number;
		totalMs: number;
		open: boolean;
		ontoggle: (open: boolean) => void;
		/** EntryRow and EntryEditor items */
		children: Snippet;
	} = $props();
</script>

{#if open}
	<section class="group" aria-label={title}>
		<header class="head">
			<button class="toggle" type="button" aria-expanded="true" onclick={() => ontoggle(false)}>
				<h2>{title}{#if badge}<span class="badge">{badge}</span>{/if}</h2>
			</button>
			<span class="meta">{strings.entries.dayTotal} <strong class="clipa-num">{formatDuration(totalMs)}</strong></span>
		</header>
		{@render children()}
	</section>
{:else}
	<button class="closed" type="button" aria-expanded="false" onclick={() => ontoggle(true)}>
		<Icon name="chevron-right" size={14} strokeWidth={2} />
		<span class="ctitle">{title}{#if badge}<span class="badge">{badge}</span>{/if}</span>
		<span class="meta">{strings.entries.count(count)} · <strong class="clipa-num">{formatDuration(totalMs)}</strong></span>
	</button>
{/if}

<style>
	.group {
		background: var(--clipa-surface);
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		padding: 14px 8px 8px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 16px 10px 8px;
	}
	.toggle {
		border: 0;
		background: transparent;
		padding: 2px 8px;
		border-radius: var(--clipa-r-sm);
		text-align: left;
	}
	.toggle:hover {
		background: var(--clipa-surface-2);
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
	}
	.badge {
		margin-left: 8px;
		font-size: 12px;
		font-weight: 550;
		color: var(--clipa-accent-text);
	}
	.meta {
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.meta strong {
		color: var(--clipa-text);
		font-weight: 600;
	}
	.closed {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 48px;
		padding: 0 16px;
		border: 1px solid var(--clipa-border);
		border-radius: 12px;
		background: var(--clipa-collapsed);
		color: var(--clipa-muted);
		text-align: left;
	}
	.closed:hover {
		background: var(--clipa-surface);
	}
	.ctitle {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		color: var(--clipa-text);
	}
</style>
