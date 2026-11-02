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
				<h2 class="clipa-display">{title}{#if badge}<span class="badge">{badge}</span>{/if}</h2>
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
		border: var(--clipa-bw) solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		box-shadow: var(--clipa-card-shadow);
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
		font-size: var(--clipa-h2-size);
	}
	.badge {
		margin-left: 8px;
		font-family: var(--clipa-label-font);
		font-size: 12px;
		font-weight: 550;
		font-stretch: 100%;
		text-transform: none;
		color: var(--clipa-accent-text);
	}
	.meta {
		font-family: var(--clipa-num-font);
		font-size: 13px;
		color: var(--clipa-muted);
		text-transform: var(--clipa-copy-transform);
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
		border: var(--clipa-bw) solid var(--clipa-border);
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
	/* Retro: a bigger title, the badge as a mustard tag, a dashed outline when closed */
	:global(:root[data-theme="retro"]) h2 {
		display: flex;
		align-items: center;
		font-size: 24px;
	}
	:global(:root[data-theme="retro"]) .badge {
		height: 24px;
		display: inline-flex;
		align-items: center;
		padding: 0 8px;
		border: 1.5px solid var(--clipa-ink);
		border-radius: var(--clipa-r-sm);
		background: var(--clipa-accent);
		color: var(--clipa-on-accent);
		font-weight: 700;
		text-transform: lowercase;
	}
	:global(:root[data-theme="retro"]) .group .meta strong {
		font-size: 20px;
	}
	:global(:root[data-theme="retro"]) .closed {
		border-style: dashed;
	}
	:global(:root[data-theme="retro"]) .ctitle {
		font-family: var(--clipa-display-font);
		font-size: 18px;
		font-weight: 900;
		font-stretch: 125%;
		text-transform: uppercase;
	}
</style>
