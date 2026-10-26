<script lang="ts">
	import { untrack } from "svelte";
	import { NO_REPEAT, repeatFromRule, ruleFromRepeat, sortDays, weekdayOf, type Repeat } from "../../../core/repeat";
	import { addLocalDays, fromLocalInput, localDate, localDateStart, toLocalInput } from "../../../core/time";
	import type { EventFields } from "../../../core/types";
	import type { EventDetail } from "../../shared/rpc-schema";
	import { EVENT_COLORS, modeRequest, type AskMode, type DialogTarget } from "../lib/calendar";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";
	import RepeatEditor from "./RepeatEditor.svelte";

	let {
		target,
		askMode,
		onclose,
	}: { target: DialogTarget; askMode: AskMode; onclose: (changed: boolean) => void } = $props();

	let dialog: HTMLDialogElement;
	let detail = $state<EventDetail | null>(null);
	let loaded = $state(false);
	let title = $state("");
	let notes = $state("");
	let color = $state<string | null>(null);
	let allDay = $state(false);
	// datetime-local values for timed events, YYYY-MM-DD for all-day events (end date included).
	let start = $state("");
	let end = $state("");
	let repeat = $state<Repeat>({ ...NO_REPEAT });
	let confirmDelete = $state(false);
	let busy = $state(false);

	/** All-day dates and the repeat rule use the event's zone. Timed inputs use the device zone. */
	const zone = $derived(detail?.event.tzid ?? tz);
	const isNew = $derived(target.kind === "new");
	const startMs = $derived(parseStart(start, allDay));

	/** The values the dialog opened with, to find what changed. */
	let original: EventFields | null = null;

	$effect(() => {
		const t = target;
		untrack(() => void load(t));
	});

	async function load(t: DialogTarget) {
		loaded = false;
		app.error = null;
		if (t.kind === "new") {
			detail = null;
			fill({ title: "", notes: "", color: null, start: t.start, end: t.end, allDay: t.allDay, rrule: null });
		} else {
			detail = await api.eventsGet({ id: t.instance.eventId });
			if (!detail) return onclose(true);
			const i = t.instance;
			fill({ title: i.title, notes: i.notes, color: detail.event.color, start: i.start, end: i.end, allDay: i.allDay, rrule: detail.event.rrule });
		}
		loaded = true;
		if (!dialog.open) dialog.showModal();
	}

	function fill(f: EventFields) {
		const z = detail?.event.tzid ?? tz;
		title = f.title;
		notes = f.notes;
		color = f.color;
		allDay = f.allDay;
		start = f.allDay ? localDate(f.start, z) : toLocalInput(f.start, tz);
		end = f.allDay ? localDate(f.end - 1, z) : toLocalInput(f.end, tz);
		repeat = repeatFromRule(f.rrule, z);
		// Read back through the inputs, so that rounding to the minute is not a change.
		original = readFields();
	}

	function parseStart(value: string, day: boolean): number | null {
		try {
			return day ? localDateStart(value, zone) : fromLocalInput(value, tz);
		} catch {
			return null;
		}
	}

	function readFields(): EventFields | null {
		const s = parseStart(start, allDay);
		let e: number | null;
		try {
			e = allDay ? addLocalDays(localDateStart(end, zone), 1, zone) : fromLocalInput(end, tz);
		} catch {
			e = null;
		}
		if (s === null || e === null) return null;
		return { title: title.trim(), notes, color, start: s, end: e, allDay, rrule: ruleFromRepeat(repeat, s, zone) };
	}

	function changesFrom(f: EventFields, o: EventFields): Partial<EventFields> {
		const changes: Partial<EventFields> = {};
		for (const key of Object.keys(f) as (keyof EventFields)[]) {
			if (f[key] !== o[key]) (changes as Record<string, unknown>)[key] = f[key];
		}
		return changes;
	}

	/** A new event follows its start day in a one-day weekly repeat. */
	function setStart(value: string) {
		const before = startMs;
		start = value;
		const after = parseStart(value, allDay);
		if (!isNew || before === null || after === null || repeat.freq !== "weekly") return;
		if (repeat.days.length === 1 && repeat.days[0] === weekdayOf(before, zone)) {
			repeat = { ...repeat, days: sortDays([weekdayOf(after, zone)]) };
		}
	}

	function setAllDay(value: boolean) {
		if (value === allDay) return;
		const s = start.slice(0, 10);
		const e = end.slice(0, 10);
		allDay = value;
		if (value) {
			start = s;
			end = e < s ? s : e;
		} else {
			start = `${s}T09:00`;
			end = `${s}T10:00`;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const fields = readFields();
		if (!fields || busy) return;
		busy = true;
		try {
			if (target.kind === "new") {
				if (await app.attempt(() => api.eventsCreate({ fields, tzid: tz }))) onclose(true);
				return;
			}
			const instance = target.instance;
			const changes = changesFrom(fields, original!);
			if (Object.keys(changes).length === 0) return onclose(false);
			const mode = instance.recurring ? await askMode(modeRequest("edit", detail!, instance, changes)) : "all";
			if (!mode) return;
			const ref = { eventId: instance.eventId, originalStart: instance.originalStart, mode };
			if (await app.attempt(() => api.eventsEditOccurrence({ ...ref, changes }))) onclose(true);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (target.kind !== "edit" || busy) return;
		const instance = target.instance;
		let mode: Awaited<ReturnType<AskMode>> = "all";
		if (instance.recurring) {
			mode = await askMode(modeRequest("delete", detail!, instance));
		} else if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		if (!mode) return;
		busy = true;
		const done = await app.attempt(() =>
			api.eventsDeleteOccurrence({ eventId: instance.eventId, originalStart: instance.originalStart, mode }),
		);
		busy = false;
		if (done) onclose(true);
	}

	function cancel(e?: Event) {
		e?.preventDefault();
		onclose(false);
	}
</script>

<dialog bind:this={dialog} oncancel={cancel} aria-labelledby="event-title">
	<h2 id="event-title">{isNew ? strings.event.newTitle : strings.event.editTitle}</h2>
	{#if loaded}
		<form onsubmit={save}>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="title" bind:value={title} placeholder={strings.event.title} aria-label={strings.event.title} autofocus />
			<label class="check">
				<input type="checkbox" checked={allDay} onchange={(e) => setAllDay(e.currentTarget.checked)} />
				{strings.event.allDay}
			</label>
			<div class="times">
				<label>
					{strings.event.start}
					<input
						type={allDay ? "date" : "datetime-local"}
						value={start}
						onchange={(e) => setStart(e.currentTarget.value)}
						required
					/>
				</label>
				<label>
					{strings.event.end}
					<input type={allDay ? "date" : "datetime-local"} bind:value={end} required />
				</label>
			</div>
			<div class="field">
				<span>{strings.event.repeat}</span>
				<RepeatEditor bind:repeat start={startMs} {zone} />
			</div>
			<div class="field">
				<span>{strings.event.color}</span>
				<div class="colors" role="radiogroup" aria-label={strings.event.color}>
					<button
						type="button"
						class="swatch default"
						class:on={color === null}
						role="radio"
						aria-checked={color === null}
						aria-label={strings.event.colorDefault}
						onclick={() => (color = null)}
					></button>
					{#each EVENT_COLORS as c (c)}
						<button
							type="button"
							class="swatch"
							class:on={color === c}
							style:background={c}
							role="radio"
							aria-checked={color === c}
							aria-label={c}
							onclick={() => (color = c)}
						></button>
					{/each}
				</div>
			</div>
			<label>
				{strings.event.notes}
				<textarea rows="3" bind:value={notes}></textarea>
			</label>
			<footer>
				{#if !isNew}
					<Button variant="danger" onclick={remove} disabled={busy}>
						{confirmDelete ? strings.event.confirmDelete : strings.event.delete}
					</Button>
				{/if}
				<span class="spacer"></span>
				<Button variant="secondary" onclick={() => cancel()}>{strings.event.cancel}</Button>
				<Button type="submit" variant="primary" disabled={busy}>{strings.event.save}</Button>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	dialog {
		width: 460px;
		max-width: calc(100vw - 40px);
	}
	form {
		display: grid;
		gap: 14px;
		margin-top: 12px;
	}
	.title {
		height: 40px;
		font-size: 15px;
		font-weight: 600;
	}
	.times {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	label,
	.field {
		display: grid;
		gap: 5px;
		font-size: 12px;
		font-weight: 600;
		color: var(--clipa-muted);
	}
	label > :global(*),
	.field > :global(:not(span)) {
		font-weight: 400;
	}
	label.check {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--clipa-text-2);
		font-size: 13px;
		font-weight: 400;
	}
	.colors {
		display: flex;
		gap: 6px;
	}
	.swatch {
		width: 22px;
		height: 22px;
		padding: 0;
		border-radius: 50%;
		border: 2px solid transparent;
	}
	.swatch.default {
		background: var(--clipa-event);
	}
	.swatch.on {
		border-color: var(--clipa-text);
	}
	footer {
		margin-top: 4px;
	}
	.spacer {
		flex: 1;
	}
</style>
