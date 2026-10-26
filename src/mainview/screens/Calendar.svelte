<script lang="ts">
	import { Calendar, DayGrid, Interaction, TimeGrid } from "@event-calendar/core";
	import "@event-calendar/core/index.css";
	import { onDestroy } from "svelte";
	import { localDate } from "../../../core/time";
	import type { EditMode, EventFields, Instance } from "../../../core/types";
	import EventDialog from "../components/EventDialog.svelte";
	import ModeDialog from "../components/ModeDialog.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { modeRequest, type DialogTarget, type ModeRequest } from "../lib/calendar";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	const HOUR = 3_600_000;
	const MINUTE = 60_000;

	// The package types the component without its methods; the instance has the Calendar methods.
	let instance = $state<unknown>();
	const ec = $derived(instance as Calendar | undefined);
	let target = $state<DialogTarget | null>(null);
	let asking = $state<{ request: ModeRequest; resolve: (mode: EditMode | null) => void } | null>(null);

	function askMode(request: ModeRequest): Promise<EditMode | null> {
		return new Promise((resolve) => (asking = { request, resolve }));
	}

	function answer(mode: EditMode | null) {
		asking?.resolve(mode);
		asking = null;
	}

	/** Event instances, and tracked time as background events (day and week views only). */
	async function fetchEvents(info: Calendar.FetchInfo): Promise<Calendar.EventInput[]> {
		const from = info.start.getTime();
		const to = info.end.getTime();
		const [instances, entries] = await Promise.all([
			api.eventsInstances({ from, to }),
			app.settings.showTrackedTime ? api.entriesList({ from, to }) : Promise.resolve([]),
		]);
		const now = Date.now();
		return [
			...entries.map(
				(e): Calendar.EventInput => ({
					id: `entry:${e.id}`,
					start: new Date(e.started_at),
					end: new Date(e.ended_at ?? now),
					display: "background",
					classNames: "tracked",
				}),
			),
			...instances.map(
				(i): Calendar.EventInput => ({
					id: `${i.eventId}:${i.originalStart}`,
					// EventCalendar shows all-day events by local date.
					start: i.allDay ? localDate(i.start, tz) : new Date(i.start),
					end: i.allDay ? localDate(i.end, tz) : new Date(i.end),
					allDay: i.allDay,
					title: i.title || strings.calendar.untitled,
					color: i.color ?? undefined,
					extendedProps: { instance: i },
				}),
			),
		];
	}

	function refetch() {
		ec?.refetchEvents();
	}

	function openNew(start: Date, end: Date, allDay: boolean) {
		target = { kind: "new", start: start.getTime(), end: end.getTime(), allDay };
	}

	function closeDialog(changed: boolean) {
		target = null;
		ec?.unselect();
		// A new revision reloads the calendar (the effect below) and the other screens.
		if (changed) app.revision++;
	}

	/** A drag or resize. A repeating event asks for the mode; cancel puts the event back. */
	async function moved(info: Calendar.EventDropInfo | Calendar.EventResizeInfo) {
		const instance = info.event.extendedProps.instance as Instance | undefined;
		if (!instance) return info.revert();
		const changes: Partial<EventFields> = { start: info.event.start.getTime(), end: info.event.end.getTime() };
		if (info.event.allDay !== instance.allDay) changes.allDay = info.event.allDay;
		let mode: EditMode | null = "all";
		if (instance.recurring) {
			const detail = await app.attempt(() => api.eventsGet({ id: instance.eventId }));
			mode = detail ? await askMode(modeRequest("edit", detail, instance, changes)) : null;
		}
		if (!mode) return info.revert();
		const ref = { eventId: instance.eventId, originalStart: instance.originalStart, mode };
		const done = await app.attempt(() => api.eventsEditOccurrence({ ...ref, changes }));
		if (!done) info.revert();
		app.revision++;
	}

	async function toggleTracked(show: boolean) {
		const settings = await app.attempt(() => api.settingsSet({ showTrackedTime: show }));
		if (settings) app.settings = settings;
		refetch();
	}

	let options = $state<Calendar.Options>({
		view: "timeGridWeek",
		headerToolbar: { start: "prev,next today", center: "title", end: "tracked dayGridMonth,timeGridWeek,timeGridDay" },
		buttonText: (text) => ({ ...text, ...strings.calendar.buttons }),
		firstDay: 1,
		height: "100%",
		nowIndicator: true,
		scrollTime: "07:00:00",
		selectable: true,
		editable: true,
		eventSources: [{ events: fetchEvents }],
		dateClick: (info) => {
			const start = info.date;
			const end = info.allDay ? new Date(start.getTime() + 24 * HOUR) : new Date(start.getTime() + HOUR);
			openNew(start, end, info.allDay);
		},
		select: (info) => openNew(info.start, info.end, info.allDay),
		eventClick: (info) => {
			const instance = info.event.extendedProps.instance as Instance | undefined;
			if (instance) target = { kind: "edit", instance };
		},
		eventDrop: (info) => void moved(info),
		eventResize: (info) => void moved(info),
	});

	// Reload when events or entries change, and every minute while the timer runs.
	let seen = app.revision;
	$effect(() => {
		if (app.revision !== seen) {
			seen = app.revision;
			refetch();
		}
	});
	const tick = setInterval(() => {
		if (app.running && app.settings.showTrackedTime) refetch();
	}, MINUTE);
	onDestroy(() => clearInterval(tick));
</script>

<div class="calendar ec-auto-dark">
	<Calendar bind:this={instance} plugins={[TimeGrid, DayGrid, Interaction]} {options}>
		{#snippet customButtonTracked()}
			<label class="tracked-toggle">
				<input
					type="checkbox"
					checked={app.settings.showTrackedTime}
					onchange={(e) => toggleTracked(e.currentTarget.checked)}
				/>
				{strings.calendar.showTracked}
			</label>
		{/snippet}
	</Calendar>
</div>

{#if target}
	<EventDialog {target} {askMode} onclose={closeDialog} />
{/if}
{#if asking}
	<ModeDialog request={asking.request} onchoose={answer} />
{/if}

<style>
	.calendar {
		height: 100%;
		padding: 16px 20px;
	}
	.calendar :global(.ec) {
		--ec-bg-color: var(--surface);
		--ec-border-color: var(--border);
		--ec-button-bg-color: var(--surface);
		--ec-button-active-bg-color: var(--selected);
		--ec-event-bg-color: var(--accent);
		--ec-event-text-color: var(--accent-text);
		--ec-now-indicator-color: var(--danger);
		height: 100%;
	}
	.calendar :global(.ec-bg-event.tracked) {
		background-color: var(--tracked);
		opacity: 0.35;
	}
	.tracked-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-right: 12px;
		font-size: 12px;
		white-space: nowrap;
	}
</style>
