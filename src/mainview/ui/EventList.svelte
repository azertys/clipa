<script lang="ts">
	import type { EventCoverage } from "../../../core/reports";
	import { formatDuration, formatPercent, MINUTE } from "../../../core/time";
	import type { Instance } from "../../../core/types";
	import { clockRange } from "../lib/app.svelte";
	import { strings } from "../strings";
	import Button from "./Button.svelte";
	import CoverageBar from "./CoverageBar.svelte";
	import Icon from "./Icon.svelte";

	let {
		events,
		now,
		soonMinutes = 10,
		onstarttimer,
	}: {
		/** Timed events of one day with their coverage, sorted by start */
		events: (EventCoverage & { instance: Instance })[];
		now: number;
		/** Show "Start timer" when an event starts within this many minutes */
		soonMinutes?: number;
		onstarttimer?: (event: Instance) => void;
	} = $props();
</script>

{#if events.length === 0}
	<p class="empty">{strings.today.eventsEmpty}</p>
{:else}
	<ul class="list">
		{#each events as ev (`${ev.instance.eventId}:${ev.instance.originalStart}`)}
			{@const until = Math.ceil((ev.instance.start - now) / MINUTE)}
			{@const ongoing = until <= 0 && ev.instance.end > now}
			<li
				class="item"
				class:upcoming-item={until > 0}
				class:colored={ev.instance.color !== null}
				style:--event={ev.instance.color ?? undefined}
			>
				<div class="head">
					<span class="title">
						<span class="dot" aria-hidden="true"></span>
						<span class="name">{ev.instance.title || strings.calendar.untitled}</span>
						{#if ev.instance.recurring}
							<span class="rep"><Icon name="repeat" size={12} strokeWidth={2} label={strings.today.repeats} /></span>
						{/if}
					</span>
					<span class="time clipa-num">{clockRange(ev.instance.start, ev.instance.end)}</span>
				</div>
				{#if until > 0}
					<div class="upcoming">
						<span class="soon">
							{strings.today.startsIn(until < 60 ? strings.today.minutes(until) : formatDuration(until * MINUTE))}
						</span>
						{#if until <= soonMinutes && onstarttimer}
							<Button size="sm" variant="secondary" onclick={() => onstarttimer(ev.instance)}>
								{strings.today.startTimer}
							</Button>
						{/if}
					</div>
				{:else}
					<div class="cov">
						<CoverageBar value={ev.coverage} tone="tracked" />
						<span class="sub">
							{strings.today.coverage(formatDuration(ev.trackedMs), formatDuration(ev.plannedMs), formatPercent(ev.coverage))}{ongoing
								? strings.today.ongoing
								: ""}
						</span>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		margin: 0;
		padding: 8px 0;
		color: var(--clipa-muted);
		font-size: 13px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--clipa-evcard-gap);
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: var(--clipa-evcard-pad);
		border-top: 1px solid var(--clipa-divider);
		border-radius: var(--clipa-evcard-radius);
		background: var(--clipa-evcard-bg);
		color: var(--clipa-evcard-fg);
	}
	.item:last-child {
		padding-bottom: 0;
	}
	.cov {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 550;
		min-width: 0;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--event, var(--clipa-event));
		flex: none;
	}
	.rep {
		color: var(--clipa-faint);
		display: inline-flex;
	}
	.time {
		font-size: 12px;
		color: var(--clipa-muted);
		flex: none;
	}
	.sub {
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.upcoming {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 30px;
	}
	.soon {
		font-family: var(--clipa-label-font);
		font-size: 12px;
		color: var(--clipa-event-soft);
	}
	/* Retro: each event is a teal card. An event with its own color gets that color, muted toward
	   the beige like tag chips. An upcoming event is a dashed outline. */
	:global(:root[data-theme="retro"]) .item {
		--clipa-sq-empty: #1f5458;
		border: var(--clipa-evcard-border);
	}
	:global(:root[data-theme="retro"]) .item:last-child {
		padding-bottom: 14px;
	}
	:global(:root[data-theme="retro"]) .item.colored {
		--clipa-sq-empty: var(--clipa-track);
		background: color-mix(in srgb, var(--event) var(--clipa-chip-mix), var(--clipa-surface));
		color: var(--clipa-text);
	}
	:global(:root[data-theme="retro"]) .item.upcoming-item {
		border-style: dashed;
		background: var(--clipa-surface);
		color: var(--clipa-text);
	}
	:global(:root[data-theme="retro"]) .title {
		font-size: 16px;
		font-weight: 700;
	}
	:global(:root[data-theme="retro"]) .name {
		text-transform: lowercase;
	}
	:global(:root[data-theme="retro"]) .dot {
		display: none;
	}
	:global(:root[data-theme="retro"]) .time,
	:global(:root[data-theme="retro"]) .sub,
	:global(:root[data-theme="retro"]) .rep {
		color: inherit;
		opacity: 0.85;
	}
	:global(:root[data-theme="retro"]) .cov {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
	}
	:global(:root[data-theme="retro"]) .soon {
		font-weight: 700;
	}
</style>
