<script lang="ts">
	import { onDestroy } from "svelte";
	import type { ReportTable } from "../../../core/export";
	import type { Report } from "../../../core/reports";
	import {
		dateRange,
		formatDuration,
		formatPercent,
		localDate,
		MINUTE,
		presetRange,
		startOfLocalDay,
		type RangePreset,
	} from "../../../core/time";
	import { app, tagColor, tz } from "../lib/app.svelte";
	import { dateRangeLabel, shortDay } from "../lib/dates";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import AppUsageList from "../ui/AppUsageList.svelte";
	import Button from "../ui/Button.svelte";
	import Card from "../ui/Card.svelte";
	import DayBarChart from "../ui/DayBarChart.svelte";
	import EventCoverageTable from "../ui/EventCoverageTable.svelte";
	import PageHeader from "../ui/PageHeader.svelte";
	import Segmented from "../ui/Segmented.svelte";
	import StatCard from "../ui/StatCard.svelte";
	import TagBreakdown from "../ui/TagBreakdown.svelte";
	import type { EventCoverageRow } from "../ui/types";

	type Preset = RangePreset | "custom";
	const presets: Preset[] = ["today", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];
	const ALL_TABLES: ReportTable[] = ["days", "events", "tags", "apps"];

	let preset = $state<Preset>("thisWeek");
	let customFrom = $state("");
	let customTo = $state("");
	let includeAllDay = $state(false);
	let report = $state<Report | null>(null);
	let notice = $state<string | null>(null);

	// Changes once a day, so the range does not follow the one-second clock.
	const today = $derived(startOfLocalDay(app.now, tz));
	const range = $derived.by(() => {
		if (preset !== "custom") return presetRange(preset, today, tz, app.settings.weekStart);
		try {
			return dateRange(customFrom, customTo, tz);
		} catch {
			return null;
		}
	});
	const query = $derived(range && range.from < range.to ? { ...range, tzid: tz, includeAllDay } : null);
	const subtitle = $derived.by(() => {
		if (!query) return "";
		const dates = dateRangeLabel(localDate(query.from, tz), localDate(query.to - 1, tz), "long", true);
		return preset === "custom" ? dates : `${strings.reports.presets[preset]} · ${dates}`;
	});

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

	async function exportCsv(tables: ReportTable[]) {
		if (!query) return;
		const q = query;
		const saved = await app.attempt(() => api.reportsExportCsv({ ...q, tables }));
		if (!saved) return;
		notice =
			saved.paths.length === 1
				? strings.reports.exported(saved.paths[0].split("/").pop() ?? saved.paths[0])
				: strings.reports.exportedMany(saved.paths.length);
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 5000);
	}

	const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

	const view = $derived.by(() => {
		if (!report) return null;
		const r = report;
		const short = r.days.length <= 7;
		// One row per event or repeating series, in the order of the first instance.
		const rows = new Map<string, EventCoverageRow>();
		for (const e of r.events) {
			const row = rows.get(e.eventId) ?? {
				key: e.eventId,
				title: e.title,
				color: e.color,
				occurrences: 0,
				recurring: e.recurring,
				plannedMs: 0,
				trackedMs: 0,
			};
			row.occurrences++;
			row.plannedMs += e.plannedMs;
			row.trackedMs += e.trackedMs;
			rows.set(e.eventId, row);
		}
		return {
			daysTracked: r.days.filter((d) => d.trackedMs > 0).length,
			covered: ratio(r.totals.coveredMs, r.totals.plannedMs),
			outside: ratio(r.totals.outsideEventsMs, r.totals.trackedMs),
			days: r.days.map((d) => ({
				label: short ? shortDay(d.date) : String(Number(d.date.slice(8))),
				plannedMs: d.plannedMs,
				trackedMs: d.trackedMs,
			})),
			events: [...rows.values()],
			tags: r.tags.map((t) => {
				const tag = t.tagId === null ? undefined : app.tagById.get(t.tagId);
				return {
					key: t.tagId ?? "",
					name: t.tagId === null ? strings.tags.untagged : (tag?.name ?? "?"),
					color: t.tagId === null ? "var(--clipa-faint)" : tagColor(tag),
					ms: t.ms,
				};
			}),
			apps: r.apps.map((a) => ({ name: a.name, ms: a.ms, titles: a.titles })),
		};
	});
</script>

<PageHeader title={strings.reports.title} {subtitle}>
	{#snippet aside()}
		<Button variant="outline" icon="download" onclick={() => exportCsv(ALL_TABLES)} disabled={!query}>
			{strings.reports.exportAll}
		</Button>
	{/snippet}
</PageHeader>

<div class="toolbar">
	<Segmented
		label={strings.reports.range}
		value={preset}
		onchange={setPreset}
		options={presets.map((p) => ({ value: p, label: strings.reports.presets[p] }))}
	/>
	{#if preset === "custom"}
		<label class="date">{strings.reports.from} <input type="date" bind:value={customFrom} /></label>
		<label class="date">{strings.reports.to} <input type="date" bind:value={customTo} /></label>
	{/if}
	<label class="check"><input type="checkbox" bind:checked={includeAllDay} />{strings.reports.includeAllDay}</label>
</div>
{#if preset === "custom" && !query}<p class="error-text">{strings.errors.REPORT_RANGE_INVALID}</p>{/if}
{#if notice}<p class="notice" role="status">{notice}</p>{/if}

{#if report && view}
	<div class="stats">
		<StatCard
			label={strings.reports.tracked}
			swatch="tracked"
			value={formatDuration(report.totals.trackedMs)}
			sub={strings.reports.entriesDays(report.entryCount, view.daysTracked)}
		/>
		<StatCard
			label={strings.reports.planned}
			swatch="planned"
			value={formatDuration(report.totals.plannedMs)}
			sub={strings.reports.eventCount(report.events.length)}
		/>
		<StatCard
			label={strings.reports.covered}
			value={formatDuration(report.totals.coveredMs)}
			progress={view.covered}
			sub={strings.reports.coveredOf(formatPercent(view.covered))}
		/>
		<StatCard
			label={strings.reports.outside}
			value={formatDuration(report.totals.outsideEventsMs)}
			sub={strings.reports.ofTracked(formatPercent(view.outside))}
		/>
	</div>

	<Card title={strings.reports.perDay}>
		{#snippet actions()}
			<span class="legend"><span class="sw planned"></span>{strings.reports.planned}</span>
			<span class="legend"><span class="sw tracked"></span>{strings.reports.tracked}</span>
			<Button size="sm" variant="outline" aria-label={strings.reports.csvLabel(strings.reports.perDay)} onclick={() => exportCsv(["days"])}>
				{strings.reports.csv}
			</Button>
		{/snippet}
		<DayBarChart days={view.days} />
	</Card>

	<Card title={strings.reports.eventsTitle} list>
		{#snippet actions()}
			<Button
				size="sm"
				variant="outline"
				aria-label={strings.reports.csvLabel(strings.reports.eventsTitle)}
				onclick={() => exportCsv(["events"])}
				disabled={report?.events.length === 0}
			>
				{strings.reports.csv}
			</Button>
		{/snippet}
		<EventCoverageTable rows={view.events} />
	</Card>

	<div class="two">
		<Card title={strings.reports.tagsTitle}>
			{#snippet actions()}
				<Button
					size="sm"
					variant="outline"
					aria-label={strings.reports.csvLabel(strings.reports.tagsTitle)}
					onclick={() => exportCsv(["tags"])}
					disabled={report?.tags.length === 0}
				>
					{strings.reports.csv}
				</Button>
			{/snippet}
			<TagBreakdown rows={view.tags} />
		</Card>
		<Card title={strings.reports.appsTitle}>
			{#snippet actions()}
				<Button
					size="sm"
					variant="outline"
					aria-label={strings.reports.csvLabel(strings.reports.appsTitle)}
					onclick={() => exportCsv(["apps"])}
					disabled={report?.apps.length === 0}
				>
					{strings.reports.csv}
				</Button>
			{/snippet}
			<AppUsageList apps={view.apps} />
		</Card>
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.check,
	.date {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--clipa-text-2);
	}
	.notice,
	.error-text {
		margin: -8px 0 0;
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.error-text {
		color: var(--clipa-danger-text);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
	.sw.planned {
		border: 1.5px solid var(--clipa-faint);
	}
	.sw.tracked {
		background: var(--clipa-tracked);
	}
	.two {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: flex-start;
	}
	.two > :global(*) {
		flex: 1 1 360px;
	}
</style>
