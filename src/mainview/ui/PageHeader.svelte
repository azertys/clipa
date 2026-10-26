<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		subtitle,
		aside,
	}: {
		title: string;
		subtitle?: string | Snippet;
		/** Right side: totals or a primary button */
		aside?: Snippet;
	} = $props();
</script>

<header class="ph">
	<div>
		<h1>{title}</h1>
		{#if typeof subtitle === "string"}<p>{subtitle}</p>{:else if subtitle}<p>{@render subtitle()}</p>{/if}
	</div>
	{#if aside}<div class="aside">{@render aside()}</div>{/if}
</header>

<style>
	.ph {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 650;
		letter-spacing: -0.015em;
	}
	p {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	p :global(strong) {
		color: var(--clipa-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.aside {
		display: flex;
		align-items: center;
		gap: 20px;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.aside :global(strong) {
		color: var(--clipa-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>
