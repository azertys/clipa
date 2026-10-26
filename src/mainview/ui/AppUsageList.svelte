<script lang="ts">
	import { formatDuration } from "../../../core/time";
	import { strings } from "../strings";
	import CoverageBar from "./CoverageBar.svelte";

	let {
		apps,
		limit = 6,
	}: {
		apps: { name: string; ms: number }[];
		/** Apps after this count fold into "Other (n apps)" */
		limit?: number;
	} = $props();

	const rows = $derived.by(() => {
		const sorted = [...apps].sort((a, b) => b.ms - a.ms);
		const total = sorted.reduce((s, a) => s + a.ms, 0);
		if (sorted.length <= limit) return { total, list: sorted, other: null };
		const rest = sorted.slice(limit - 1);
		return {
			total,
			list: sorted.slice(0, limit - 1),
			other: { name: strings.reports.other(rest.length), ms: rest.reduce((s, a) => s + a.ms, 0) },
		};
	});
	const share = (ms: number) => (rows.total > 0 ? ms / rows.total : 0);
</script>

{#if apps.length === 0}
	<p class="empty">{strings.reports.noApps}</p>
{:else}
	<ul class="list">
		{#each rows.list as app (app.name)}
			<li>
				<div class="line"><span>{app.name}</span><span class="v clipa-num">{formatDuration(app.ms)}</span></div>
				<CoverageBar value={share(app.ms)} tone="accent" />
			</li>
		{/each}
		{#if rows.other}
			<li>
				<div class="line">
					<span class="muted">{rows.other.name}</span><span class="v clipa-num">{formatDuration(rows.other.ms)}</span>
				</div>
				<CoverageBar value={share(rows.other.ms)} tone="neutral" />
			</li>
		{/if}
	</ul>
{/if}

<style>
	.empty {
		margin: 0;
		color: var(--clipa-muted);
		font-size: 13px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	li {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}
	.v {
		font-weight: 600;
	}
	.muted {
		color: var(--clipa-muted);
	}
</style>
