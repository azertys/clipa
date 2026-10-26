<script lang="ts">
	import { untrack } from "svelte";
	import { entryInterval, trackedMs } from "../../../core/entries";
	import { overlappingIds } from "../../../core/overlap";
	import { addLocalDays, formatDuration, localDate, localDateStart, MINUTE, startOfLocalDay } from "../../../core/time";
	import type { EntryInput, EntryWithTags } from "../../../core/types";
	import ConfirmDialog from "../components/ConfirmDialog.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { dateRangeLabel, longDay } from "../lib/dates";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";
	import DayGroup from "../ui/DayGroup.svelte";
	import EntryEditor from "../ui/EntryEditor.svelte";
	import EntryRow from "../ui/EntryRow.svelte";
	import Icon from "../ui/Icon.svelte";
	import Menu from "../ui/Menu.svelte";
	import PageHeader from "../ui/PageHeader.svelte";
	import RangeStepper from "../ui/RangeStepper.svelte";
	import SearchField from "../ui/SearchField.svelte";

	const DAYS = 7;

	let endDay = $state(startOfLocalDay(Date.now(), tz));
	let tagFilter = $state("");
	let query = $state("");
	let entries = $state<EntryWithTags[]>([]);
	/** The entry in the editor: an id, "new", or null. */
	let editing = $state<string | null>(null);
	let newDraft = $state<{ start: number; end: number; tagIds: string[] } | null>(null);
	/** Open or closed day groups that the user toggled. Others follow the default. */
	let toggled = $state<Record<string, boolean>>({});
	let menu = $state<{ entry: EntryWithTags; anchor: HTMLElement } | null>(null);
	let confirming = $state<EntryWithTags | null>(null);

	const today = $derived(startOfLocalDay(app.now, tz));
	const from = $derived(addLocalDays(endDay, -(DAYS - 1), tz));
	const to = $derived(addLocalDays(endDay, 1, tz));
	const isCurrent = $derived(endDay >= today);
	const rangeShort = $derived(dateRangeLabel(localDate(from, tz), localDate(endDay, tz), "short"));
	const rangeLong = $derived(dateRangeLabel(localDate(from, tz), localDate(endDay, tz), "long"));

	$effect(() => {
		const [f, t] = [from, to];
		void [app.revision, app.running?.id];
		void api.entriesList({ from: f, to: t }).then((list) => (entries = list));
	});

	// Other screens open an entry, or a new one, through app.panelEntryId.
	$effect(() => {
		const id = app.panelEntryId;
		if (id !== null) untrack(() => void openFromNavigation(id));
	});

	async function openFromNavigation(id: string) {
		app.panelEntryId = null;
		if (id === "new") return startNew();
		const entry = await api.entriesGet({ id });
		if (!entry) return;
		const day = startOfLocalDay(entry.started_at, tz);
		if (day < from || day >= to) endDay = Math.min(today, addLocalDays(day, DAYS - 1, tz));
		toggled[localDate(day, tz)] = true;
		editing = id;
	}

	function startNew() {
		const end = Math.floor(Date.now() / MINUTE) * MINUTE;
		newDraft = { start: end - 30 * MINUTE, end, tagIds: [...app.settings.defaultTagIds] };
		editing = "new";
		endDay = today;
	}

	const overlaps = $derived(overlappingIds(entries.map((e) => ({ id: e.id, ...entryInterval(e, app.now) }))));
	const filtered = $derived(
		entries.filter(
			(e) =>
				(tagFilter === "" || e.tagIds.includes(tagFilter)) &&
				(query.trim() === "" || e.note.toLowerCase().includes(query.trim().toLowerCase())),
		),
	);
	const total = $derived(trackedMs(filtered, from, to, app.now));

	// Grouped by the local day of the start, newest day first. The first two days are open.
	const days = $derived.by(() => {
		const groups = new Map<string, EntryWithTags[]>();
		for (const e of filtered) {
			const day = localDate(e.started_at, tz);
			if (!groups.has(day)) groups.set(day, []);
			groups.get(day)!.push(e);
		}
		return [...groups].map(([date, list], i) => {
			const start = localDateStart(date, tz);
			return {
				date,
				list,
				open: toggled[date] ?? i < 2,
				total: trackedMs(list, start, addLocalDays(start, 1, tz), app.now),
			};
		});
	});

	async function save(input: EntryInput) {
		const saved = await app.attempt(() => api.entriesUpsert(input));
		if (!saved) return;
		if (saved.ended_at === null) app.setRunning(saved, true);
		editing = null;
		newDraft = null;
		app.revision++;
	}

	async function remove(entry: EntryWithTags) {
		if (await app.attempt(() => api.entriesDelete({ id: entry.id }))) {
			editing = null;
			app.revision++;
		}
	}

	function cancel() {
		editing = null;
		newDraft = null;
	}
</script>

<PageHeader title={strings.entries.title}>
	{#snippet subtitle()}
		{strings.entries.subtitle(rangeLong, filtered.length)}<strong>{formatDuration(total)}</strong>
	{/snippet}
	{#snippet aside()}
		<Button variant="primary" icon="plus" onclick={startNew}>{strings.entries.add}</Button>
	{/snippet}
</PageHeader>

<div class="toolbar" role="toolbar" aria-label={strings.entries.filters}>
	<RangeStepper
		label={isCurrent ? strings.entries.lastDays(DAYS, rangeShort) : rangeShort}
		onprev={() => (endDay = addLocalDays(endDay, -DAYS, tz))}
		onnext={() => (endDay = Math.min(today, addLocalDays(endDay, DAYS, tz)))}
		onpick={() => (endDay = today)}
		nextDisabled={isCurrent}
	/>
	<label class="tag-filter">
		<Icon name="tag" size={13} strokeWidth={2.2} />
		<span class="clipa-sr-only">{strings.entries.allTags}</span>
		<select bind:value={tagFilter}>
			<option value="">{strings.entries.allTags}</option>
			{#each app.tags as tag (tag.id)}<option value={tag.id}>{tag.name}</option>{/each}
		</select>
	</label>
	<SearchField bind:value={query} />
</div>

{#if editing === "new" && newDraft}
	<section class="new">
		<EntryEditor entry={null} draft={newDraft} onsave={save} oncancel={cancel} />
	</section>
{/if}

{#if days.length === 0 && editing !== "new"}
	<p class="empty">{strings.entries.empty}</p>
{/if}

<div class="groups">
	{#each days as day (day.date)}
		<DayGroup
			title={longDay(day.date)}
			badge={day.date === localDate(today, tz) ? strings.entries.todayBadge : undefined}
			count={day.list.length}
			totalMs={day.total}
			open={day.open}
			ontoggle={(open) => (toggled[day.date] = open)}
		>
			{#each day.list as entry (entry.id)}
				{#if editing === entry.id}
					<EntryEditor {entry} onsave={save} oncancel={cancel} ondelete={remove} />
				{:else}
					<EntryRow
						{entry}
						now={app.now}
						overlap={overlaps.has(entry.id)}
						action="more"
						onopen={(e) => (editing = e.id)}
						onmore={(e, anchor) => (menu = { entry: e, anchor })}
					/>
				{/if}
			{/each}
		</DayGroup>
	{/each}
</div>

{#if menu}
	{@const target = menu.entry}
	<Menu
		anchor={menu.anchor}
		onclose={() => (menu = null)}
		items={[
			{ label: strings.entries.continue, onselect: () => void app.continueWith(target) },
			{ label: strings.entries.edit, onselect: () => (editing = target.id) },
			{ label: strings.common.delete, danger: true, onselect: () => (confirming = target) },
		]}
	/>
{/if}

{#if confirming}
	{@const target = confirming}
	<ConfirmDialog
		message={strings.editor.confirmDelete}
		onanswer={(yes) => {
			confirming = null;
			if (yes) void remove(target);
		}}
	/>
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.tag-filter {
		position: relative;
		display: inline-flex;
		align-items: center;
		color: var(--clipa-text-2);
	}
	.tag-filter :global(svg) {
		position: absolute;
		left: 12px;
		pointer-events: none;
	}
	.tag-filter select {
		height: 36px;
		padding: 0 14px 0 32px;
		border-color: var(--clipa-border-strong);
		border-radius: var(--clipa-r-md);
		background: transparent;
		color: var(--clipa-text-2);
		font-weight: 550;
	}
	.new {
		padding: 4px 8px;
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		background: var(--clipa-surface);
	}
	.groups {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.empty {
		margin: 0;
		color: var(--clipa-muted);
		font-size: 13px;
	}
</style>
