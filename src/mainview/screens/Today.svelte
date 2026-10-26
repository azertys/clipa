<script lang="ts">
	import { entryInterval, firstLine, trackedMs } from "../../../core/entries";
	import { overlappingIds } from "../../../core/overlap";
	import { coverageList, trackedIntervals } from "../../../core/reports";
	import {
		addLocalDays,
		formatClock,
		formatDuration,
		formatElapsed,
		formatPercent,
		startOfLocalDay,
	} from "../../../core/time";
	import type { EntryWithTags, Instance } from "../../../core/types";
	import TagCombobox from "../components/TagCombobox.svelte";
	import TagList from "../components/TagList.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	let entries = $state<EntryWithTags[]>([]);
	let instances = $state<Instance[]>([]);

	const dayStart = $derived(startOfLocalDay(app.now, tz));
	const dayEnd = $derived(addLocalDays(dayStart, 1, tz));
	const elapsed = $derived(app.running ? app.now - app.running.started_at : 0);
	const total = $derived(trackedMs(entries, dayStart, dayEnd, app.now));
	const overlaps = $derived(
		overlappingIds(entries.map((e) => ({ id: e.id, ...entryInterval(e, app.now) }))),
	);

	const tracked = $derived(trackedIntervals(entries, dayStart, dayEnd, app.now));
	const events = $derived(coverageList(instances, tracked, dayStart, dayEnd));

	async function load() {
		[entries, instances] = await Promise.all([
			api.entriesList({ from: dayStart, to: dayEnd }),
			api.eventsInstances({ from: dayStart, to: dayEnd }),
		]);
	}

	$effect(() => {
		// Reload when the day, the data or the running entry changes.
		void [dayStart, app.revision, app.running?.id];
		void load();
	});
</script>

<section class="today">
	<div class="timer card">
		<div class="clock" class:live={app.running}>
			<span class="elapsed">{formatElapsed(elapsed)}</span>
			<span class="state">{app.running ? strings.timer.running : strings.timer.stopped}</span>
		</div>
		<button class="primary big" class:stop={app.running} onclick={() => app.toggleTimer()}>
			{app.running ? strings.timer.stop : strings.timer.start}
		</button>
		<textarea
			rows="3"
			placeholder={strings.timer.notePlaceholder}
			value={app.note}
			oninput={(e) => app.editTimer({ note: e.currentTarget.value })}
		></textarea>
		<TagCombobox selected={app.tagIds} onchange={(ids) => app.editTimer({ tagIds: ids })} />
	</div>

	<div class="card">
		<header class="row">
			<h2>{strings.today.entriesTitle}</h2>
			<span class="total">{strings.today.total} <strong>{formatDuration(total)}</strong></span>
		</header>
		{#if entries.length === 0}
			<p class="muted">{strings.today.empty}</p>
		{:else}
			<ul class="entries">
				{#each entries as entry (entry.id)}
					<li>
						<button
							class="entry"
							onclick={() => app.navigate({ screen: "entries", entryId: entry.id })}
						>
							<span class="time">
								{formatClock(entry.started_at, tz)}–{entry.ended_at ? formatClock(entry.ended_at, tz) : strings.entries.running}
							</span>
							<span class="note">
								{#if overlaps.has(entry.id)}<span class="warn" title={strings.entries.overlap}>⚠︎</span>{/if}
								{firstLine(entry.note) || strings.entries.noNote}
							</span>
							<TagList ids={entry.tagIds} />
							<span class="dur">{formatDuration((entry.ended_at ?? app.now) - entry.started_at)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="card">
		<h2>{strings.today.eventsTitle}</h2>
		{#if events.length === 0}
			<p class="muted">{strings.today.eventsEmpty}</p>
		{:else}
			<ul class="events">
				{#each events as e (`${e.instance.eventId}:${e.instance.originalStart}`)}
					<li>
						<button class="event" onclick={() => (app.screen = "calendar")}>
							<span class="time">{formatClock(e.instance.start, tz)}–{formatClock(e.instance.end, tz)}</span>
							<span class="note">
								<span class="dot" style:background={e.instance.color ?? "var(--accent)"}></span>
								{e.instance.title || strings.calendar.untitled}
							</span>
							<span class="bar" aria-hidden="true">
								{#each e.segments as seg (seg.start)}
									<span
										style:left="{((seg.start - Math.max(e.instance.start, dayStart)) / e.plannedMs) * 100}%"
										style:width="{((seg.end - seg.start) / e.plannedMs) * 100}%"
									></span>
								{/each}
							</span>
							<span class="dur">
								{strings.today.coverage(formatDuration(e.trackedMs), formatDuration(e.plannedMs), formatPercent(e.coverage))}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.today {
		display: grid;
		gap: 16px;
		max-width: 760px;
	}
	.timer {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
		align-items: center;
	}
	.timer textarea,
	.timer :global(.combo) {
		grid-column: 1 / -1;
	}
	.clock {
		display: flex;
		flex-direction: column;
	}
	.elapsed {
		font-size: 40px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.5px;
	}
	.state {
		font-size: 12px;
		color: var(--muted);
	}
	.clock.live .state {
		color: var(--accent);
	}
	.big {
		min-width: 110px;
		padding: 10px 20px;
		font-size: 15px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.total {
		color: var(--muted);
	}
	.total strong {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.entries,
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entry,
	.event {
		display: grid;
		grid-template-columns: 110px 1fr auto 56px;
		gap: 12px;
		align-items: center;
		width: 100%;
		padding: 8px 6px;
		border: none;
		border-top: 1px solid var(--border);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.event {
		grid-template-columns: 110px 1fr 120px 150px;
	}
	.entry:hover,
	.event:hover {
		background: var(--hover);
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 6px;
	}
	.bar {
		position: relative;
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
	.time,
	.dur {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.dur {
		text-align: right;
		color: var(--text);
	}
	.note {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.warn {
		color: var(--warn);
		margin-right: 4px;
	}
</style>
