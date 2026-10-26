<script lang="ts">
	import { formatDuration, formatPercent } from "../../../core/time";
	import { strings } from "../strings";
	import CoverageBar from "./CoverageBar.svelte";
	import type { EventCoverageRow } from "./types";

	let { rows, warnBelow = 0.75 }: { rows: EventCoverageRow[]; warnBelow?: number } = $props();

	const ratio = (part: number, whole: number) => (whole <= 0 ? 0 : Math.min(1, part / whole));
	const totals = $derived(
		rows.reduce(
			(t, r) => ({ n: t.n + r.occurrences, p: t.p + r.plannedMs, tr: t.tr + r.trackedMs }),
			{ n: 0, p: 0, tr: 0 },
		),
	);
</script>

{#if rows.length === 0}
	<p class="empty">{strings.reports.noEvents}</p>
{:else}
	<div class="scroll">
		<table class="clipa-num">
			<thead>
				<tr>
					<th scope="col" class="first">{strings.reports.colEvent}</th>
					<th scope="col" class="r">{strings.reports.colTimes}</th>
					<th scope="col" class="r">{strings.reports.colPlanned}</th>
					<th scope="col" class="r">{strings.reports.colTracked}</th>
					<th scope="col" class="cov">{strings.reports.colCoverage}</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.key)}
					{@const r = ratio(row.trackedMs, row.plannedMs)}
					<tr>
						<td class="first">
							<span class="dot" style:background={row.color ?? undefined} aria-hidden="true"></span>
							{row.title || strings.calendar.untitled}
							{#if row.recurring}<span class="rep" title={strings.reports.repeats}> ↻</span>{/if}
						</td>
						<td class="r muted">{row.occurrences}</td>
						<td class="r">{formatDuration(row.plannedMs)}</td>
						<td class="r">{formatDuration(row.trackedMs)}</td>
						<td class="cov">
							<div class="covcell">
								<CoverageBar value={r} height={6} {warnBelow} />
								<span class="pct" class:warn={r < warnBelow}>{formatPercent(r)}</span>
							</div>
						</td>
					</tr>
				{/each}
				<tr class="total">
					<td class="first">{strings.reports.total}</td>
					<td class="r muted">{totals.n}</td>
					<td class="r">{formatDuration(totals.p)}</td>
					<td class="r">{formatDuration(totals.tr)}</td>
					<td class="cov good">{formatPercent(ratio(totals.tr, totals.p))}</td>
				</tr>
			</tbody>
		</table>
	</div>
{/if}

<style>
	.empty {
		margin: 0;
		padding: 0 16px 10px;
		color: var(--clipa-muted);
		font-size: 13px;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 560px;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		color: var(--clipa-faint);
		font-size: 12px;
		font-weight: 550;
		text-align: left;
		padding: 8px 12px;
		border-top: 1px solid var(--clipa-divider);
	}
	td {
		padding: 10px 12px;
		border-top: 1px solid var(--clipa-divider);
	}
	.first {
		padding-left: 16px;
	}
	.cov {
		padding-right: 16px;
		width: 34%;
	}
	.r {
		text-align: right;
	}
	.muted {
		color: var(--clipa-muted);
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 6px;
		border-radius: 50%;
		background: var(--clipa-event);
	}
	.rep {
		color: var(--clipa-faint);
	}
	.covcell {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.pct {
		width: 48px;
		text-align: right;
		color: var(--clipa-text-2);
	}
	.pct.warn {
		color: var(--clipa-event-soft);
	}
	.total td {
		font-weight: 650;
		border-top-color: var(--clipa-border-raised);
		padding-top: 12px;
		padding-bottom: 12px;
	}
	.good {
		color: var(--clipa-tracked-text);
	}
</style>
