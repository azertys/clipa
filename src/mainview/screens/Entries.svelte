<script lang="ts">
	import { entryInterval, firstLine, trackedMs } from "../../../core/entries";
	import { overlappingIds } from "../../../core/overlap";
	import {
		addLocalDays,
		formatClock,
		formatDuration,
		localDate,
		localDateStart,
		startOfLocalDay,
	} from "../../../core/time";
	import { Temporal } from "../../../core/temporal";
	import type { EntryWithTags } from "../../../core/types";
	import EntryPanel from "../components/EntryPanel.svelte";
	import TagList from "../components/TagList.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	const today = startOfLocalDay(Date.now(), tz);
	let fromDate = $state(localDate(addLocalDays(today, -6, tz), tz));
	let toDate = $state(localDate(today, tz));
	let tagFilter = $state("");
	let text = $state("");
	let entries = $state<EntryWithTags[]>([]);

	const from = $derived(fromDate ? localDateStart(fromDate, tz) : today);
	const to = $derived(toDate ? addLocalDays(localDateStart(toDate, tz), 1, tz) : addLocalDays(today, 1, tz));

	$effect(() => {
		void [from, to, app.revision, app.running?.id];
		void load();
	});

	async function load() {
		entries = await api.entriesList({ from, to });
	}

	const overlaps = $derived(
		overlappingIds(entries.map((e) => ({ id: e.id, ...entryInterval(e, app.now) }))),
	);

	const filtered = $derived(
		entries.filter(
			(e) =>
				(tagFilter === "" || e.tagIds.includes(tagFilter)) &&
				(text.trim() === "" || e.note.toLowerCase().includes(text.trim().toLowerCase())),
		),
	);

	// Grouped by the local day of the start, newest day first.
	const days = $derived.by(() => {
		const groups = new Map<string, EntryWithTags[]>();
		for (const e of filtered) {
			const day = localDate(e.started_at, tz);
			if (!groups.has(day)) groups.set(day, []);
			groups.get(day)!.push(e);
		}
		return [...groups].map(([date, list]) => {
			const start = localDateStart(date, tz);
			return { date, list, total: trackedMs(list, start, addLocalDays(start, 1, tz), app.now) };
		});
	});

	const dayLabel = (date: string) =>
		Temporal.PlainDate.from(date).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric" });
</script>

<div class="layout">
	<section class="main">
		<div class="toolbar">
			<label>{strings.entries.filterFrom} <input type="date" bind:value={fromDate} /></label>
			<label>{strings.entries.filterTo} <input type="date" bind:value={toDate} /></label>
			<label>
				{strings.entries.filterTag}
				<select bind:value={tagFilter}>
					<option value="">{strings.entries.allTags}</option>
					{#each app.tags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}
				</select>
			</label>
			<input class="search" type="search" placeholder={strings.entries.filterText} bind:value={text} />
			<span class="spacer"></span>
			<button class="primary" onclick={() => (app.panelEntryId = "new")}>{strings.entries.add}</button>
		</div>

		{#if days.length === 0}
			<p class="muted">{strings.entries.empty}</p>
		{/if}
		{#each days as day (day.date)}
			<div class="day card">
				<header>
					<h3>{dayLabel(day.date)}</h3>
					<span class="muted">{strings.entries.dayTotal} <strong>{formatDuration(day.total)}</strong></span>
				</header>
				<ul>
					{#each day.list as entry (entry.id)}
						<li>
							<button
								class="entry"
								class:selected={app.panelEntryId === entry.id}
								onclick={() => (app.panelEntryId = entry.id)}
							>
								<span class="time">
									{formatClock(entry.started_at, tz)}–{entry.ended_at ? formatClock(entry.ended_at, tz) : strings.entries.running}
								</span>
								<span class="note">
									{#if overlaps.has(entry.id)}
										<span class="warn" title={strings.entries.overlap} aria-label={strings.entries.overlap}>⚠︎</span>
									{/if}
									{firstLine(entry.note) || strings.entries.noNote}
								</span>
								<TagList ids={entry.tagIds} />
								<span class="dur">{formatDuration((entry.ended_at ?? app.now) - entry.started_at)}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>

	{#if app.panelEntryId}
		<EntryPanel entryId={app.panelEntryId} onclose={() => (app.panelEntryId = null)} />
	{/if}
</div>

<style>
	.layout {
		display: flex;
		height: 100%;
		min-height: 0;
	}
	.main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 20px 24px;
		display: grid;
		gap: 12px;
		align-content: start;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.toolbar label {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		color: var(--muted);
	}
	.search {
		min-width: 160px;
	}
	.spacer {
		flex: 1;
	}
	.day header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.day strong {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 14px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entry {
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
	.entry:hover {
		background: var(--hover);
	}
	.entry.selected {
		background: var(--selected);
	}
	.time {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.dur {
		text-align: right;
		font-variant-numeric: tabular-nums;
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
