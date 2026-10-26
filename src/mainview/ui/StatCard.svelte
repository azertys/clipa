<script lang="ts">
	import type { Snippet } from "svelte";
	import CoverageBar from "./CoverageBar.svelte";

	let {
		label,
		value,
		sub,
		swatch,
		progress,
	}: {
		label: string;
		/** The big number, already formatted, for example "31:20" */
		value: string;
		/** Small line under the value */
		sub?: string | Snippet;
		swatch?: "tracked" | "planned";
		/** 0..1: shows a bar next to the sub line */
		progress?: number;
	} = $props();
</script>

<div class="stat">
	<span class="label">
		{#if swatch}<span class="sw {swatch}" aria-hidden="true"></span>{/if}
		{label}
	</span>
	<span class="value clipa-num">{value}</span>
	{#if progress !== undefined}
		<div class="prog">
			<CoverageBar value={progress} tone="tracked" />
			{#if typeof sub === "string"}<span class="sub good clipa-num">{sub}</span>{/if}
		</div>
	{:else if typeof sub === "string"}
		<span class="sub">{sub}</span>
	{:else if sub}
		<span class="sub">{@render sub()}</span>
	{/if}
</div>

<style>
	.stat {
		background: var(--clipa-surface);
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.sw.tracked {
		background: var(--clipa-tracked);
	}
	.sw.planned {
		border: 1.5px solid var(--clipa-faint);
	}
	.value {
		font-size: 32px;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.sub {
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.good {
		color: var(--clipa-tracked-text);
		white-space: nowrap;
	}
	.prog {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
