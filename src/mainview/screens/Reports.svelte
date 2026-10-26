<script lang="ts">
	import { onDestroy } from "svelte";
	import type { ReportTable } from "../../../core/export";
	import type { Report } from "../../../core/reports";
	import {
		dateRange,
		formatClock,
		formatDuration,
		formatPercent,
		localDate,
		MINUTE,
		presetRange,
		startOfLocalDay,
		type RangePreset,
	} from "../../../core/time";
	import { Temporal } from "../../../core/temporal";
	import DayChart from "../components/DayChart.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	type Preset = RangePreset | "custom";
	const presets: Preset[] = ["today", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];

	let preset = $state<Preset>("thisWeek");
	let customFrom = $state("");
	let customTo = $state("");
	let includeAllDay = $state(false);
	let report = $state<Report | null>(null);
	let notice = $state<string | null>(null);

	// Changes once a day, so the range does not follow the one-second clock.
	const today = $derived(startOfLocalDay(app.now, tz));
	const range = $derived.by(() => {
		if (preset !== "custom") return presetRange(preset, today, tz);
		try {
			return dateRange(customFrom, customTo, tz);
		} catch {
			return null;
		}
	});
	const query = $derived(range && range.from < range.to ? { ...range, tzid: tz, includeAllDay } : null);
	const covered = $derived(
		report && report.totals.plannedMs > 0 ? report.totals.coveredMs / report.totals.plannedMs : 0,
	);

	function setPreset(next: Preset) {
		if (next === "custom" && range) {
			customFrom = localDate(range.from, tz);
			customTo = localDate(range.to - 1, tz);
		}
		preset = next;
	}

	async function load() {
		if (!query) return;
		const q = query;
		const next = await app.attempt(() => api.reportsGet(q));
		if (next && q === query) report = next;
	}

	$effect(() => {
		void [query, app.revision];
		void load();
	});

	// A running entry grows: reload every minute while the timer runs.
	const tick = setInterval(() => {
		if (app.running) void load();
	}, MINUTE);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => {
		clearInterval(tick);
		clearTimeout(noticeTimer);
	});

	async function exportCsv(table: ReportTable) {
		if (!query) return;
		const saved = await app.attempt(() => api.reportsExportCsv({ ...query!, table }));
		if (!saved) return;
		notice = strings.reports.exported(saved.path.split("/").pop() ?? saved.path);
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 5000);
	}

	const dateLabel = (ms: number) =>
		Temporal.PlainDate.from(localDate(ms, tz)).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric" });

	const tagName = (id: string | null) => (id === null ? strings.tags.untagged : (app.tagById.get(id)?.name ?? "?"));
	const tagColor = (id: string | null) => (id === null ? "var(--muted)" : (app.tagById.get(id)?.color ?? "var(--accent)"));
</script>

<section class="reports">
	<header class="controls">
		<div class="presets" role="radiogroup" aria-label={strings.reports.range}>
			{#each presets as p (p)}
				<button class:active={preset === p} role="radio" aria-checked={preset === p} onclick={() => setPreset(p)}>
					{strings.reports.presets[p]}
				</button>
			{/each}
		</div>
		{#if preset === "custom"}
			<label>{strings.reports.from} <input type="date" bind:value={customFrom} /></label>
			<label>{strings.reports.to} <input type="date" bind:value={customTo} /></label>
		{/if}
		<label class="check">
			<input type="checkbox" bind:checked={includeAllDay} />
			{strings.reports.includeAllDay}
		</label>
	</header>
	{#if preset === "custom" && !query}<p class="error-text">{strings.errors.REPORT_RANGE_INVALID}</p>{/if}
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}

	{#if report}
		<div class="summary">
			<div class="stat card">
				<span>{strings.reports.tracked}</span>
				<strong>{formatDuration(report.totals.trackedMs)}</strong>
			</div>
			<div class="stat card">
				<span>{strings.reports.planned}</span>
				<strong>{formatDuration(report.totals.plannedMs)}</strong>
			</div>
			<div class="stat card">
				<span>{strings.reports.covered}</span>
				<strong>{formatDuration(report.totals.coveredMs)}</strong>
				<small>{strings.reports.coveredOf(formatPercent(covered))}</small>
			</div>
			<div class="stat card">
				<span>{strings.reports.outside}</span>
				<strong>{formatDuration(report.totals.outsideEventsMs)}</strong>
			</div>
		</div>

		<div class="card">
			<header class="row">
				<h2>{strings.reports.perDay}</h2>
				<button onclick={() => exportCsv("days")}>{strings.reports.exportCsv}</button>
			</header>
			<DayChart days={report.days} />
		</div>

		<div class="card">
			<header class="row">
				<h2>{strings.reports.eventsTitle}</h2>
				<button onclick={() => exportCsv("events")} disabled={report.events.length === 0}>
					{strings.reports.exportCsv}
				</button>
			</header>
			{#if report.events.length === 0}
				<p class="muted">{strings.reports.noEvents}</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>{strings.reports.colEvent}</th>
							<th>{strings.reports.colDate}</th>
							<th class="num">{strings.reports.colPlanned}</th>
							<th class="num">{strings.reports.colTracked}</th>
							<th class="num">{strings.reports.colCoverage}</th>
							<th class="bar-col"></th>
						</tr>
					</thead>
					<tbody>
						{#each report.events as e (`${e.eventId}:${e.originalStart}`)}
							{@const shownFrom = Math.max(e.start, report.range.from)}
							<tr>
								<td class="title">
									<span class="dot" style:background={e.color ?? "var(--accent)"}></span>
									{e.title || strings.calendar.untitled}
									{#if e.partial}<span class="partial" title={strings.reports.partial}>*</span>{/if}
								</td>
								<td class="when">
									{dateLabel(e.start)}
									<span class="muted">
										{e.allDay ? strings.reports.allDay : `${formatClock(e.start, tz)}–${formatClock(e.end, tz)}`}
									</span>
								</td>
								<td class="num">{formatDuration(e.plannedMs)}</td>
								<td class="num">{formatDuration(e.trackedMs)}</td>
								<td class="num">{formatPercent(e.coverage)}</td>
								<td class="bar-col">
									<span class="bar" aria-hidden="true">
										{#each e.segments as seg (seg.start)}
											<span
												style:left="{((seg.start - shownFrom) / e.plannedMs) * 100}%"
												style:width="{((seg.end - seg.start) / e.plannedMs) * 100}%"
											></span>
										{/each}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<div class="pair">
			<div class="card">
				<header class="row">
					<h2>{strings.reports.tagsTitle}</h2>
					<button onclick={() => exportCsv("tags")} disabled={report.tags.length === 0}>
						{strings.reports.exportCsv}
					</button>
				</header>
				{#if report.tags.length === 0}
					<p class="muted">{strings.reports.noTags}</p>
				{:else}
					<table>
						<thead>
							<tr><th>{strings.reports.colTag}</th><th class="num">{strings.reports.colTime}</th></tr>
						</thead>
						<tbody>
							{#each report.tags as t (t.tagId ?? "")}
								<tr>
									<td><span class="dot" style:background={tagColor(t.tagId)}></span>{tagName(t.tagId)}</td>
									<td class="num">{formatDuration(t.ms)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
			<div class="card">
				<header class="row">
					<h2>{strings.reports.appsTitle}</h2>
					<button onclick={() => exportCsv("apps")} disabled={report.apps.length === 0}>
						{strings.reports.exportCsv}
					</button>
				</header>
				{#if report.apps.length === 0}
					<p class="muted">{strings.reports.noApps}</p>
				{:else}
					<table>
						<thead>
							<tr><th>{strings.reports.colApp}</th><th class="num">{strings.reports.colTime}</th></tr>
						</thead>
						<tbody>
							{#each report.apps as a (a.appId)}
								<tr>
									<td>{a.name}</td>
									<td class="num">{formatDuration(a.ms)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.reports {
		display: grid;
		gap: 16px;
		max-width: 980px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.presets {
		display: flex;
	}
	.presets button {
		border-radius: 0;
		margin-left: -1px;
	}
	.presets button:first-child {
		border-radius: 6px 0 0 6px;
	}
	.presets button:last-child {
		border-radius: 0 6px 6px 0;
	}
	.presets button.active {
		background: var(--selected);
		font-weight: 600;
	}
	.controls label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
	}
	.controls label.check {
		color: var(--text);
	}
	.notice,
	.error-text {
		margin: -4px 0 0;
		font-size: 12px;
		color: var(--muted);
	}
	.error-text {
		color: var(--danger);
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	.stat {
		display: grid;
		gap: 2px;
	}
	.stat span,
	.stat small {
		color: var(--muted);
		font-size: 12px;
	}
	.stat strong {
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}
	.row h2 {
		margin: 0;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: start;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		text-align: left;
		font-weight: 500;
		font-size: 12px;
		color: var(--muted);
		padding: 4px 6px;
	}
	td {
		padding: 7px 6px;
		border-top: 1px solid var(--border);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.title {
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		white-space: nowrap;
	}
	.when .muted {
		margin-left: 6px;
		font-variant-numeric: tabular-nums;
	}
	.partial {
		color: var(--muted);
		margin-left: 2px;
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 6px;
	}
	.bar-col {
		width: 140px;
	}
	.bar {
		position: relative;
		display: block;
		height: 8px;
		border-radius: 4px;
		background: var(--selected);
		overflow: hidden;
	}
	.bar span {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--tracked);
	}
</style>
