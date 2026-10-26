<script lang="ts">
	import { formatDuration, formatPercent } from "../../../core/time";
	import { strings } from "../strings";

	let {
		rows,
	}: {
		/** Time per tag. Entries with several tags count for each tag. */
		rows: { key: string; name: string; color: string; ms: number }[];
	} = $props();

	const sorted = $derived([...rows].sort((a, b) => b.ms - a.ms));
	const total = $derived(sorted.reduce((s, r) => s + r.ms, 0));
</script>

{#if sorted.length === 0}
	<p class="empty">{strings.reports.noTaggedTime}</p>
{:else}
	<div class="stack" aria-hidden="true">
		{#each sorted as r (r.key)}
			<div style="flex: {r.ms} 1 0; background: {r.color}"></div>
		{/each}
	</div>
	<ul class="list">
		{#each sorted as r (r.key)}
			<li>
				<span class="sw" style="background: {r.color}" aria-hidden="true"></span>
				<span class="name">{r.name}</span>
				<span class="pct clipa-num">{formatPercent(total > 0 ? r.ms / total : 0)}</span>
				<span class="v clipa-num">{formatDuration(r.ms)}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		margin: 0;
		color: var(--clipa-muted);
		font-size: 13px;
	}
	.stack {
		display: flex;
		gap: 2px;
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		margin-bottom: 14px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 13px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-top: 1px solid var(--clipa-divider);
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex: none;
	}
	.name {
		flex: 1;
		min-width: 0;
	}
	.pct {
		width: 52px;
		text-align: right;
		color: var(--clipa-muted);
	}
	.v {
		width: 52px;
		text-align: right;
		font-weight: 600;
	}
</style>
