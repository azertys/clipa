<script lang="ts">
	import { Calendar, DayGrid, Interaction, TimeGrid } from "@event-calendar/core";
	import "@event-calendar/core/index.css";
	import { onDestroy } from "svelte";
	import { localDate, type WeekStart } from "../../../core/time";
	import type { EditMode, EventFields, Instance } from "../../../core/types";
	import EventDialog from "../components/EventDialog.svelte";
	import ModeDialog from "../components/ModeDialog.svelte";
	import { app, tz } from "../lib/app.svelte";
	import { modeRequest, type DialogTarget, type ModeRequest } from "../lib/calendar";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import PageHeader from "../ui/PageHeader.svelte";
	import Toggle from "../ui/Toggle.svelte";

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
					// A narrow bar at the right edge of the day (clipa-ui-svelte README, "Calendar").
					classNames: e.ended_at === null ? ["tracked", "running"] : "tracked",
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
					classNames: "clipa-event",
					styles: i.color ? [`--event: ${i.color}`] : [],
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

	/** EventCalendar counts days from Sunday = 0. */
	const firstDay = (weekStart: WeekStart): Calendar.dayOfWeek => (weekStart === 7 ? 0 : 1);

	function timeFormats(hour12: boolean): Pick<Calendar.Options, "slotLabelFormat" | "eventTimeFormat"> {
		const format: Intl.DateTimeFormatOptions = hour12
			? { hour: "numeric", minute: "2-digit", hour12: true }
			: { hour: "2-digit", minute: "2-digit", hour12: false };
		return { slotLabelFormat: format, eventTimeFormat: format };
	}

	let options = $state<Calendar.Options>({
		view: "timeGridWeek",
		headerToolbar: { start: "prev,next today", center: "title", end: "dayGridMonth,timeGridWeek,timeGridDay" },
		buttonText: (text) => ({ ...text, ...strings.calendar.buttons }),
		firstDay: firstDay(app.settings.weekStart),
		// Day before month ("Mon 26", "26 Oct – 1 Nov 2026"), as in the rest of the app.
		locale: "en-GB",
		dayHeaderFormat: { weekday: "short", day: "numeric" },
		...timeFormats(app.settings.hour12),
		slotHeight: 28,
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

	// Follow the time format and week start settings.
	$effect(() => {
		Object.assign(options, timeFormats(app.settings.hour12), { firstDay: firstDay(app.settings.weekStart) });
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

<PageHeader title={strings.calendar.title}>
	{#snippet aside()}
		<span class="toggle-label">{strings.calendar.showTracked}</span>
		<Toggle
			label={strings.calendar.showTracked}
			checked={app.settings.showTrackedTime}
			onchange={(show) => toggleTracked(show)}
		/>
	{/snippet}
</PageHeader>

<div class="calendar">
	<Calendar bind:this={instance} plugins={[TimeGrid, DayGrid, Interaction]} {options} />
</div>

{#if target}
	<EventDialog {target} {askMode} onclose={closeDialog} />
{/if}
{#if asking}
	<ModeDialog request={asking.request} onchoose={answer} />
{/if}

<style>
	.toggle-label {
		color: var(--clipa-text-2);
	}
	.calendar {
		flex: 1;
		min-height: 0;
		padding: 16px;
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		background: var(--clipa-surface);
	}

	/* EventCalendar theme mapped to the design tokens (clipa-ui-svelte README, "Calendar"). */
	.calendar :global(.ec) {
		color-scheme: dark;
		height: 100%;
		--ec-bg-color: var(--clipa-surface);
		--ec-text-color: var(--clipa-text);
		--ec-border-color: var(--clipa-divider);
		--ec-color-400: var(--clipa-faint);
		--ec-color-300: var(--clipa-border-strong);
		--ec-color-200: var(--clipa-surface-2);
		--ec-color-100: var(--clipa-surface);
		--ec-color-50: var(--clipa-bg);
		--ec-button-bg-color: var(--clipa-surface);
		--ec-button-border-color: var(--clipa-border-strong);
		--ec-button-text-color: var(--clipa-text-2);
		--ec-button-active-bg-color: var(--clipa-surface-3);
		--ec-button-active-border-color: var(--clipa-border-strong);
		--ec-button-active-text-color: var(--clipa-text);
		--ec-today-bg-color: var(--clipa-accent-tint);
		--ec-highlight-color: var(--clipa-accent-tint);
		--ec-now-indicator-color: var(--clipa-danger);
		--ec-popup-bg-color: var(--clipa-menu);
		--ec-bg-event-opacity: 1;
		font-size: 13px;
	}
	.calendar :global(.ec-time-grid) {
		/* Keep events 14 px from the right edge so the tracked bar stays visible. */
		--ec-event-col-gap: 14px;
	}
	.calendar :global(.ec-toolbar) {
		margin-bottom: 12px;
	}
	.calendar :global(.ec-title) {
		font-size: 16px;
		font-weight: 650;
	}
	.calendar :global(.ec-button) {
		height: 32px;
		border-radius: var(--clipa-r);
		font-size: 13px;
	}
	.calendar :global(.ec-day.ec-sat),
	.calendar :global(.ec-day.ec-sun) {
		--ec-day-bg-color: var(--clipa-weekend);
	}
	.calendar :global(.ec-event.clipa-event) {
		--event-color: var(--event, var(--clipa-event));
		background-color: color-mix(in srgb, var(--event-color) 18%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--event-color) 50%, transparent);
		color: color-mix(in srgb, var(--event-color) 35%, var(--clipa-chip-text-base));
	}
	.calendar :global(.ec-bg-event.tracked) {
		justify-self: end;
		inline-size: 6px;
		margin-inline-end: 3px;
		border-radius: 3px;
		background: var(--clipa-tracked);
	}
	.calendar :global(.ec-bg-event.running) {
		background: repeating-linear-gradient(
			135deg,
			var(--clipa-tracked) 0,
			var(--clipa-tracked) 6px,
			var(--clipa-tracked-dark) 6px,
			var(--clipa-tracked-dark) 12px
		);
	}
</style>
