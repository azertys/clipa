<script lang="ts">
	import { entryInterval, type Combo } from "../../../core/entries";
	import { length, overlappingIds } from "../../../core/overlap";
	import { coverageList, trackedIntervals } from "../../../core/reports";
	import { addLocalDays, formatDuration, localDate, startOfLocalDay } from "../../../core/time";
	import type { EntryWithTags, Instance } from "../../../core/types";
	import { app, tz } from "../lib/app.svelte";
	import { longDay } from "../lib/dates";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import AppUsageList from "../ui/AppUsageList.svelte";
	import Card from "../ui/Card.svelte";
	import DayTimeline from "../ui/DayTimeline.svelte";
	import EntryRow from "../ui/EntryRow.svelte";
	import EventList from "../ui/EventList.svelte";
	import PageHeader from "../ui/PageHeader.svelte";
	import TimerCard from "../ui/TimerCard.svelte";

	let entries = $state<EntryWithTags[]>([]);
	let instances = $state<Instance[]>([]);
	let recent = $state<Combo[]>([]);
	let apps = $state<{ name: string; ms: number }[]>([]);

	// Apps of the running timer, refreshed every 10 s while it runs.
	$effect(() => {
		if (!app.running?.id) return;
		const load = () => api.timerApps({}).then((list) => (apps = list));
		void load();
		const timer = setInterval(load, 10_000);
		return () => clearInterval(timer);
	});

	const dayStart = $derived(startOfLocalDay(app.now, tz));
	const dayEnd = $derived(addLocalDays(dayStart, 1, tz));
	const title = $derived(longDay(localDate(dayStart, tz)));

	// The running entry shows in the timer card, so the list has the closed entries only.
	const closed = $derived(entries.filter((e) => e.ended_at !== null));
	const tracked = $derived(trackedIntervals(entries, dayStart, dayEnd, app.now));
	const closedTracked = $derived(trackedIntervals(closed, dayStart, dayEnd, app.now));
	const timed = $derived(instances.filter((i) => !i.allDay));
	const events = $derived(coverageList(instances, tracked, dayStart, dayEnd));
	const plannedMs = $derived(events.reduce((s, e) => s + e.plannedMs, 0));
	const overlaps = $derived(overlappingIds(entries.map((e) => ({ id: e.id, ...entryInterval(e, app.now) }))));

	async function load() {
		[entries, instances, recent] = await Promise.all([
			api.entriesList({ from: dayStart, to: dayEnd }),
			api.eventsInstances({ from: dayStart, to: dayEnd }),
			api.timerRecent({ limit: 3 }),
		]);
	}

	$effect(() => {
		// Reload when the day, the data or the running entry changes.
		void [dayStart, app.revision, app.running?.id];
		void load();
	});

	function startFromEvent(event: Instance) {
		void app.continueWith({ note: event.title, tagIds: app.tagIds });
	}
</script>

<PageHeader title={strings.nav.today} subtitle={title}>
	{#snippet aside()}
		<span>{strings.today.tracked} <strong>{formatDuration(length(tracked))}</strong></span>
		<span>{strings.today.planned} <strong>{formatDuration(plannedMs)}</strong></span>
	{/snippet}
</PageHeader>

<TimerCard
	running={app.running}
	now={app.now}
	note={app.note}
	tagIds={app.tagIds}
	continueWith={recent}
	onnote={(note) => app.editTimer({ note })}
	ontags={(tagIds) => app.editTimer({ tagIds })}
	onstart={() => app.toggleTimer()}
	onstop={() => app.toggleTimer()}
	ondiscard={() => app.discardTimer()}
	oncontinue={(combo) => app.continueWith(combo)}
	onstartedat={(ms) => app.setStartedAt(ms)}
/>

<DayTimeline
	events={timed}
	tracked={closedTracked}
	runningSince={app.running?.started_at ?? null}
	now={app.now}
	{dayStart}
	{dayEnd}
/>

<div class="cols">
	<div class="main">
		<Card title={strings.today.entriesTitle} list>
			{#snippet meta()}
				{strings.today.entriesMeta(closed.length)}<strong>{formatDuration(length(closedTracked))}</strong>{app.running
					? strings.today.plusRunning
					: ""}
			{/snippet}
			{#if closed.length === 0}
				<p class="empty">{strings.today.empty}</p>
			{/if}
			{#each closed as entry (entry.id)}
				<EntryRow
					{entry}
					now={app.now}
					overlap={overlaps.has(entry.id)}
					onopen={(e) => app.navigate({ screen: "entries", entryId: e.id })}
					oncontinue={(e) => app.continueWith(e)}
				/>
			{/each}
		</Card>
	</div>
	<div class="side">
		{#if app.running}
			<Card title={strings.today.appsTitle}>
				{#snippet meta()}{strings.today.appsMeta}{/snippet}
				{#if apps.length === 0}
					<p class="muted-text">{strings.today.appsEmpty}</p>
				{:else}
					<AppUsageList {apps} />
				{/if}
			</Card>
		{/if}
		<Card title={strings.today.eventsTitle}>
			{#snippet meta()}{strings.today.planned} <strong>{formatDuration(plannedMs)}</strong>{/snippet}
			<EventList {events} now={app.now} onstarttimer={startFromEvent} />
		</Card>
	</div>
</div>

<style>
	.cols {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: flex-start;
	}
	.main {
		flex: 999 1 480px;
		min-width: 0;
	}
	.side {
		flex: 1 1 300px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.muted-text {
		margin: 0;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.empty {
		margin: 0;
		padding: 4px 16px 12px;
		font-size: 13px;
		color: var(--clipa-muted);
	}
</style>
