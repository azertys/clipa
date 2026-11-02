<script lang="ts">
	import type { Snippet } from "svelte";
	import CoverageBar from "./CoverageBar.svelte";

	let {
		label,
		value,
		sub,
		tone = "default",
		progress,
	}: {
		label: string;
		/** The big number, already formatted, for example "31:20" */
		value: string;
		/** Small line under the value */
		sub?: string | Snippet;
		/** Colors the tile in retro; tracked and planned get a swatch in dark */
		tone?: "default" | "tracked" | "planned" | "covered" | "outside";
		/** 0..1: shows a meter next to the sub line */
		progress?: number;
	} = $props();
</script>

<div class="stat {tone}">
	<span class="label">
		{#if tone === "tracked" || tone === "planned"}<span class="sw" aria-hidden="true"></span>{/if}
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
		color: var(--clipa-text);
		border: var(--clipa-bw) solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		box-shadow: var(--clipa-card-shadow);
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.tracked {
		background: var(--clipa-stat-tracked-bg);
		color: var(--clipa-stat-tracked-fg);
	}
	.covered {
		--clipa-sq-empty: #1f5458;
		background: var(--clipa-stat-covered-bg);
		color: var(--clipa-stat-covered-fg);
	}
	.outside {
		background: var(--clipa-stat-outside-bg);
		color: var(--clipa-stat-outside-fg);
	}
	.label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--clipa-label-font);
		font-size: 13px;
		color: var(--clipa-stat-label);
		text-transform: var(--clipa-label-transform);
		letter-spacing: var(--clipa-label-spacing);
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.tracked .sw {
		background: var(--clipa-tracked);
	}
	.planned .sw {
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
		color: var(--clipa-stat-label);
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
	/* Retro: colored tiles; the planned tile has a dashed outline and no shadow */
	:global(:root[data-theme="retro"]) .planned {
		border-style: var(--clipa-stat-planned-style);
		box-shadow: none;
	}
	:global(:root[data-theme="retro"]) .label {
		font-size: 12px;
		font-weight: 700;
	}
	:global(:root[data-theme="retro"]) .sw {
		display: none;
	}
	:global(:root[data-theme="retro"]) .value {
		font-size: 44px;
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1.1;
	}
	:global(:root[data-theme="retro"]) .sub {
		font-size: 14px;
	}
	:global(:root[data-theme="retro"]) .good {
		color: inherit;
	}
	:global(:root[data-theme="retro"]) .prog {
		flex-wrap: wrap;
		gap: 6px 8px;
	}
</style>
