<script lang="ts">
	import { formatDuration, HOUR } from "../../../core/time";
	import { strings } from "../strings";
	import type { DayBar } from "./types";

	let {
		days,
		height = 200,
		maxHours,
	}: {
		days: DayBar[];
		height?: number;
		/** Top of the axis. Default: the largest value rounded up to an even hour (at least 2). */
		maxHours?: number;
	} = $props();

	const top = $derived.by(() => {
		if (maxHours) return maxHours;
		const max = Math.max(0, ...days.flatMap((d) => [d.plannedMs, d.trackedMs])) / HOUR;
		return Math.max(2, Math.ceil(max / 2) * 2);
	});
	const step = $derived(top <= 8 ? 2 : top <= 16 ? 4 : 8);
	const gridlines = $derived(Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => top - i * step));
	const h = (ms: number) => Math.round((ms / HOUR / top) * height);
	/** Past two weeks the per-day values do not fit under the bars; the bars keep them as tooltips. */
	const showValues = $derived(days.length <= 14);
</script>

<div class="chart" class:dense={!showValues}>
	<div class="axis clipa-num" aria-hidden="true" style="height: {height}px">
		{#each gridlines as g (g)}
			<span style="top: {((top - g) / top) * height - 7}px">{g === 0 ? "0" : `${g}h`}</span>
		{/each}
	</div>
	<div class="plot-wrap">
		<div
			class="plot"
			style="height: {height}px; background-size: 100% {(step / top) * height}px"
			role="img"
			aria-label={strings.reports.chartLabel}
		>
			{#each days as d, i (i)}
				<div class="col">
					{#if d.plannedMs > 0}
						<div
							class="bar planned"
							style="height: {h(d.plannedMs)}px"
							title="{strings.reports.planned} {formatDuration(d.plannedMs)}"
						></div>
					{/if}
					{#if d.trackedMs > 0}
						<div
							class="bar tracked"
							style="height: {h(d.trackedMs)}px"
							title="{strings.reports.tracked} {formatDuration(d.trackedMs)}"
						></div>
					{/if}
				</div>
			{/each}
		</div>
		<div class="labels">
			{#each days as d, i (i)}
				{@const empty = d.trackedMs === 0 && d.plannedMs === 0}
				<div class="lab">
					<span class:dim={empty}>{d.label}</span>
					{#if showValues}<span class="v clipa-num">{empty ? "—" : formatDuration(d.trackedMs)}</span>{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<table class="clipa-sr-only">
	<caption>{strings.reports.chartLabel}</caption>
	<thead>
		<tr>
			<th scope="col">{strings.reports.colDay}</th>
			<th scope="col">{strings.reports.planned}</th>
			<th scope="col">{strings.reports.tracked}</th>
		</tr>
	</thead>
	<tbody>
		{#each days as d, i (i)}
			<tr>
				<th scope="row">{d.label}</th>
				<td>{formatDuration(d.plannedMs)}</td>
				<td>{formatDuration(d.trackedMs)}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.chart {
		display: flex;
		gap: 10px;
	}
	.axis {
		position: relative;
		width: 32px;
		flex: none;
		font-size: 11px;
		color: var(--clipa-faint);
	}
	.axis span {
		position: absolute;
		right: 0;
	}
	.plot-wrap {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.plot {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		align-items: end;
		border-top: 1px solid var(--clipa-chart-grid);
		background-image: linear-gradient(to top, var(--clipa-chart-grid) 1px, transparent 1px);
		background-position: bottom;
	}
	.col {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 4px;
		height: 100%;
		min-width: 0;
	}
	.bar {
		width: 22px;
		min-width: 0;
		flex: 0 1 22px;
		border-radius: 4px 4px 0 0;
	}
	.dense .col {
		gap: 2px;
	}
	.dense .bar {
		border-radius: 2px 2px 0 0;
	}
	.planned {
		border: 1.5px solid var(--clipa-faint);
		border-bottom: 0;
	}
	.tracked {
		background: var(--clipa-tracked);
	}
	.labels {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		text-align: center;
		font-size: 12px;
	}
	.dense .labels {
		font-size: 10px;
	}
	.lab {
		display: flex;
		flex-direction: column;
		color: var(--clipa-text-2);
		overflow: hidden;
	}
	.dim {
		color: var(--clipa-faint);
	}
	.v {
		color: var(--clipa-faint);
	}
</style>
