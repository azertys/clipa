<script lang="ts">
	import { atLocalMinutes, localDate, localMinutes } from "../../../core/time";
	import type { Interval } from "../../../core/types";
	import { clock, clockRange, tz } from "../lib/app.svelte";
	import { strings } from "../strings";

	/** One day's events and tracked time on two lanes, with a line at now. */
	let {
		events = [],
		tracked = [],
		runningSince = null,
		now,
		dayStart,
		dayEnd,
		tickEvery = 2,
	}: {
		events?: (Interval & { title?: string })[];
		tracked?: Interval[];
		/** Draws a striped bar from this time to now */
		runningSince?: number | null;
		now: number;
		dayStart: number;
		dayEnd: number;
		tickEvery?: number;
	} = $props();

	/** Minutes after local midnight, clamped to the day. */
	const minutesOf = (ms: number) => (ms <= dayStart ? 0 : ms >= dayEnd ? 24 * 60 : localMinutes(ms, tz));

	// 07:00–20:00, wider when something on the day is earlier or later.
	const hours = $derived.by(() => {
		const all = [...events, ...tracked, ...(runningSince === null ? [] : [{ start: runningSince, end: now }])];
		let from = 7;
		let to = 20;
		for (const i of all) {
			from = Math.min(from, Math.floor(minutesOf(i.start) / 60));
			to = Math.max(to, Math.ceil(minutesOf(i.end) / 60));
		}
		return { from, to: Math.min(24, Math.max(to, from + 1)) };
	});
	const span = $derived((hours.to - hours.from) * 60);

	function pos(ms: number): number {
		return Math.min(100, Math.max(0, ((minutesOf(ms) - hours.from * 60) / span) * 100));
	}
	function bar(i: Interval) {
		const left = pos(i.start);
		return { left, width: Math.max(0.4, pos(i.end) - left) };
	}

	const showNow = $derived(now >= dayStart && now < dayEnd);
	const nowPos = $derived(pos(now));
	const ticks = $derived.by(() => {
		const out: { label: string; left: number }[] = [];
		const first = Math.ceil((hours.from + 0.01) / tickEvery) * tickEvery;
		for (let h = first; h < hours.to; h += tickEvery) {
			const left = (((h - hours.from) * 60) / span) * 100;
			if (!showNow || Math.abs(left - nowPos) > 4) {
				out.push({ label: clock(atLocalMinutes(localDate(dayStart, tz), h * 60, tz)), left });
			}
		}
		return out;
	});
</script>

<section class="timeline" aria-label={strings.today.timeline}>
	<div class="lane">
		<span class="lane-label">{strings.today.laneEvents}</span>
		<div class="track">
			{#each events as e, i (i)}
				{@const b = bar(e)}
				<div class="seg event" style="left: {b.left}%; width: {b.width}%" title="{e.title ?? ''} · {clockRange(e.start, e.end)}"></div>
			{/each}
			{#if showNow}<div class="now" style="left: {nowPos}%" aria-hidden="true"></div>{/if}
		</div>
	</div>
	<div class="lane">
		<span class="lane-label">{strings.today.laneTracked}</span>
		<div class="track">
			{#each tracked as t, i (i)}
				{@const b = bar(t)}
				<div class="seg tracked" style="left: {b.left}%; width: {b.width}%" title={strings.today.trackedRange(clockRange(t.start, t.end))}></div>
			{/each}
			{#if runningSince !== null}
				{@const b = bar({ start: runningSince, end: now })}
				<div class="seg running" style="left: {b.left}%; width: {b.width}%" title={strings.timer.runningSince(clock(runningSince))}></div>
			{/if}
		</div>
	</div>
	<div class="lane">
		<span class="lane-label"></span>
		<div class="ticks clipa-num" aria-hidden="true">
			{#each ticks as t (t.label)}
				<span style="left: {t.left}%">{t.label}</span>
			{/each}
			{#if showNow}<span class="now-label" style="left: {nowPos}%">{clock(now)}</span>{/if}
		</div>
	</div>
</section>

<style>
	.timeline {
		background: var(--clipa-surface);
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		padding: 18px 24px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lane {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.lane-label {
		width: 60px;
		flex: none;
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.track {
		position: relative;
		flex: 1;
		height: 14px;
		border-radius: var(--clipa-r-xs);
		background: var(--clipa-surface-2);
	}
	.seg {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 3px;
	}
	.event {
		background: var(--clipa-event);
	}
	.tracked {
		background: var(--clipa-tracked);
	}
	.running {
		background: repeating-linear-gradient(
			135deg,
			var(--clipa-tracked) 0,
			var(--clipa-tracked) 6px,
			var(--clipa-tracked-dark) 6px,
			var(--clipa-tracked-dark) 12px
		);
	}
	.now {
		position: absolute;
		top: -6px;
		bottom: -32px;
		width: 2px;
		margin-left: -1px;
		background: var(--clipa-danger);
		z-index: 1;
	}
	.ticks {
		position: relative;
		flex: 1;
		height: 16px;
		font-size: 11px;
		color: var(--clipa-faint);
	}
	.ticks span {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}
	.ticks .now-label {
		color: var(--clipa-danger);
		font-weight: 600;
	}
</style>
