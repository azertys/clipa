<script lang="ts">
	import { onDestroy } from "svelte";
	import uPlot from "uplot";
	import "uplot/dist/uPlot.min.css";
	import type { Report } from "../../../core/reports";
	import { Temporal } from "../../../core/temporal";
	import { formatDuration, HOUR } from "../../../core/time";
	import { strings } from "../strings";

	/** Tracked time (narrow bar) in front of planned time (wide bar), one pair per local day. */
	let { days }: { days: Report["days"] } = $props();

	let el: HTMLDivElement;
	let chart: uPlot | null = null;

	const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

	function dayLabel(date: string | undefined, withWeekday: boolean): string {
		if (!date) return "";
		const options: Intl.DateTimeFormatOptions = withWeekday
			? { weekday: "short", day: "numeric" }
			: { day: "numeric", month: "short" };
		return Temporal.PlainDate.from(date).toLocaleString(undefined, options);
	}

	function build() {
		chart?.destroy();
		chart = null;
		if (!el || days.length === 0) return;
		// A week or less: "Mon 26". Longer: "26 Oct".
		const short = days.length <= 7;
		const xs = days.map((_, i) => i);
		const hours = (ms: number) => ms / HOUR;
		const duration = (_: uPlot, v: number | null) => (v === null ? "" : formatDuration(v * HOUR));
		const bars = uPlot.paths.bars!;
		chart = new uPlot(
			{
				width: el.clientWidth,
				height: 220,
				cursor: { points: { show: false }, drag: { x: false, y: false } },
				scales: {
					x: { time: false, range: [-0.5, days.length - 0.5] },
					y: { range: (_u, _min, max) => [0, Math.max(1, max)] },
				},
				axes: [
					{
						stroke: css("--muted"),
						grid: { show: false },
						incrs: [1, 2, 7, 14],
						values: (_u, splits) => splits.map((i) => dayLabel(days[i]?.date, short)),
					},
					{
						stroke: css("--muted"),
						grid: { stroke: css("--border"), width: 1 },
						values: (_u, splits) => splits.map((v) => formatDuration(v * HOUR)),
					},
				],
				series: [
					{ value: (_u, i) => (i === null ? "" : dayLabel(days[i]?.date, true)) },
					{
						label: strings.reports.planned,
						fill: css("--selected"),
						stroke: css("--muted"),
						width: 1,
						paths: bars({ size: [0.7, 56] }),
						points: { show: false },
						value: duration,
					},
					{
						label: strings.reports.tracked,
						fill: css("--tracked"),
						stroke: css("--tracked"),
						width: 1,
						paths: bars({ size: [0.35, 28] }),
						points: { show: false },
						value: duration,
					},
				],
			},
			[xs, days.map((d) => hours(d.plannedMs)), days.map((d) => hours(d.trackedMs))],
			el,
		);
	}

	$effect(() => {
		void days;
		build();
	});

	// Follow the window width and the light/dark theme.
	const resize = new ResizeObserver(() => chart?.setSize({ width: el.clientWidth, height: 220 }));
	const scheme = window.matchMedia("(prefers-color-scheme: dark)");
	scheme.addEventListener("change", build);
	$effect(() => {
		resize.observe(el);
		return () => resize.disconnect();
	});
	onDestroy(() => {
		scheme.removeEventListener("change", build);
		chart?.destroy();
	});
</script>

<div class="chart" bind:this={el}></div>

<style>
	.chart {
		width: 100%;
		min-height: 220px;
	}
	.chart :global(.u-legend) {
		font-size: 12px;
		color: var(--text);
	}
</style>
