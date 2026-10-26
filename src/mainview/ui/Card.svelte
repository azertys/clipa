<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		label,
		meta,
		actions,
		children,
		list = false,
		tone = "default",
	}: {
		/** Visible h2 */
		title?: string;
		/** aria-label when there is no title */
		label?: string;
		/** Right side of the header, for example a total */
		meta?: Snippet;
		/** Header buttons, for example a CSV button */
		actions?: Snippet;
		children: Snippet;
		/** List layout: rows run edge to edge with an 8 px side inset */
		list?: boolean;
		tone?: "default" | "running";
	} = $props();
</script>

<section class="card" class:list class:running={tone === "running"} aria-label={title ? undefined : label}>
	{#if title || meta || actions}
		<header class="head">
			{#if title}<h2>{title}</h2>{/if}
			<div class="right">
				{#if meta}<span class="meta">{@render meta()}</span>{/if}
				{@render actions?.()}
			</div>
		</header>
	{/if}
	{@render children()}
</section>

<style>
	.card {
		background: var(--clipa-surface);
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		padding: 18px 20px 20px;
		min-width: 0;
	}
	.card.running {
		border-color: var(--clipa-tracked-border);
	}
	.card.list {
		padding: 18px 8px 8px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 10px;
		flex-wrap: wrap;
	}
	.list .head {
		padding: 0 16px 10px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.meta {
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.meta :global(strong) {
		color: var(--clipa-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>
