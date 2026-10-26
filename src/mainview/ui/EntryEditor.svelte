<script lang="ts">
	import { untrack } from "svelte";
	import {
		addLocalDays,
		atLocalMinutes,
		formatDuration,
		HOUR,
		localDate,
		localDateStart,
		parseClock,
		parseDuration,
	} from "../../../core/time";
	import type { EntryInput, EntryWithTags } from "../../../core/types";
	import { clock, tz } from "../lib/app.svelte";
	import { strings } from "../strings";
	import Button from "./Button.svelte";
	import TagInput from "./TagInput.svelte";

	// A local draft: nothing changes until Save (⌘↵). Esc cancels. A change to Start or End updates
	// the duration; a change to Duration updates End. An End before the Start is on the next day.
	let {
		entry,
		draft,
		onsave,
		oncancel,
		ondelete,
	}: {
		/** The entry to edit, or null for a new one */
		entry: EntryWithTags | null;
		/** Start values for a new entry */
		draft?: { start: number; end: number; tagIds: string[] };
		onsave: (input: EntryInput) => void;
		oncancel: () => void;
		ondelete?: (entry: EntryWithTags) => void;
	} = $props();

	const uid = Math.random().toString(36).slice(2, 8);
	const source = untrack(() => entry ?? { started_at: draft!.start, ended_at: draft!.end, note: "", tagIds: draft!.tagIds });
	const running = untrack(() => entry !== null && entry.ended_at === null);

	let date = $state(localDate(source.started_at, tz));
	let startText = $state(clock(source.started_at));
	let endText = $state(source.ended_at === null ? "" : clock(source.ended_at));
	let durText = $state(source.ended_at === null ? "" : formatDuration(source.ended_at - source.started_at));
	let note = $state(source.note);
	let tagIds = $state([...source.tagIds]);
	let confirmDelete = $state(false);

	const startMs = $derived.by(() => {
		const min = parseClock(startText);
		try {
			return min === null ? null : atLocalMinutes(date, min, tz);
		} catch {
			return null;
		}
	});
	const endMin = $derived(parseClock(endText));
	const nextDay = $derived(startMs !== null && endMin !== null && endMin <= parseClock(startText)!);
	const endMs = $derived.by(() => {
		if (startMs === null || endMin === null || endMin === parseClock(startText)) return null;
		const day = nextDay ? localDate(addLocalDays(localDateStart(date, tz), 1, tz), tz) : date;
		return atLocalMinutes(day, endMin, tz);
	});
	const valid = $derived(startMs !== null && (running || (endMs !== null && endMs > startMs && endMs - startMs <= 24 * HOUR)));

	function syncDuration() {
		if (startMs !== null && endMs !== null && endMs > startMs) durText = formatDuration(endMs - startMs);
	}

	function syncEnd() {
		const d = parseDuration(durText);
		if (d === null || d <= 0 || d > 24 * HOUR || startMs === null) return;
		endText = clock(startMs + d);
	}

	function save() {
		if (!valid || startMs === null) return;
		onsave({ id: entry?.id, started_at: startMs, ended_at: running ? null : endMs, note, tagIds });
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.stopPropagation();
			oncancel();
		}
		if (e.key === "Enter" && e.metaKey) {
			e.preventDefault();
			e.stopPropagation();
			save();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	class="editor"
	aria-label={strings.editor.label}
	onsubmit={(e) => {
		e.preventDefault();
		save();
	}}
	{onkeydown}
>
	<div class="times">
		<div class="field">
			<label for="date-{uid}">{strings.editor.date}</label>
			<input id="date-{uid}" type="date" class="clipa-num" bind:value={date} required />
		</div>
		<div class="field">
			<label for="start-{uid}">{strings.editor.start}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input id="start-{uid}" class="clipa-num t" class:invalid={startMs === null} bind:value={startText} onblur={syncDuration} autofocus />
		</div>
		<div class="field">
			<label for="end-{uid}">{strings.editor.end}{#if nextDay && !running}<span class="next"> · {strings.editor.nextDay}</span>{/if}</label>
			{#if running}
				<input id="end-{uid}" class="t" value={strings.editor.running} disabled />
			{:else}
				<input id="end-{uid}" class="clipa-num t" class:invalid={!valid} bind:value={endText} onblur={syncDuration} />
			{/if}
		</div>
		<div class="field">
			<label for="dur-{uid}">{strings.editor.duration}</label>
			<input id="dur-{uid}" class="clipa-num d" bind:value={durText} onblur={syncEnd} disabled={running} />
		</div>
		<div class="field grow">
			<label for="tags-{uid}">{strings.editor.tags}</label>
			<TagInput id="tags-{uid}" value={tagIds} onchange={(ids) => (tagIds = ids)} height={36} />
		</div>
	</div>
	<div class="field">
		<label for="note-{uid}">{strings.editor.note}</label>
		<textarea id="note-{uid}" rows="2" bind:value={note}></textarea>
	</div>
	<div class="bar">
		{#if entry && ondelete}
			<Button
				size="sm"
				variant="danger"
				onclick={() => (confirmDelete ? ondelete(entry) : (confirmDelete = true))}
			>
				{confirmDelete ? strings.editor.confirmDelete : strings.common.delete}
			</Button>
		{/if}
		<span class="spacer"></span>
		<Button size="sm" variant="secondary" onclick={oncancel}>{strings.common.cancel}</Button>
		<Button type="submit" size="sm" variant="primary" kbd="⌘↵" disabled={!valid}>{strings.common.save}</Button>
	</div>
</form>

<style>
	.editor {
		margin: 4px 0;
		padding: 14px 16px 16px;
		border: 1px solid var(--clipa-edit-border);
		border-radius: var(--clipa-r-lg);
		background: var(--clipa-edit-bg);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.times {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.grow {
		flex: 1 1 240px;
	}
	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--clipa-muted);
	}
	.next {
		font-weight: 400;
		color: var(--clipa-faint);
	}
	input,
	textarea {
		border-color: var(--clipa-border-raised);
		background: var(--clipa-edit-field);
	}
	.t {
		width: 96px;
	}
	.d {
		width: 72px;
	}
	input:disabled {
		color: var(--clipa-faint);
	}
	.invalid {
		border-color: var(--clipa-danger);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
</style>
