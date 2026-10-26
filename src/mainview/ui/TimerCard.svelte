<script lang="ts">
	import { firstLine, type Combo } from "../../../core/entries";
	import { atLocalMinutes, formatElapsed, localDate, parseClock } from "../../../core/time";
	import type { EntryWithTags } from "../../../core/types";
	import { app, clock, tagColor, tz } from "../lib/app.svelte";
	import { strings } from "../strings";
	import Button from "./Button.svelte";
	import TagInput from "./TagInput.svelte";

	// ⌘↵ starts and stops the timer; App.svelte listens for it on the window.
	let {
		running,
		now,
		note,
		tagIds,
		continueWith = [],
		onnote,
		ontags,
		onstart,
		onstop,
		ondiscard,
		oncontinue,
		onstartedat,
	}: {
		/** null = idle */
		running: EntryWithTags | null;
		/** The shared clock (ms), so the sidebar and this card tick together */
		now: number;
		note: string;
		tagIds: string[];
		/** Recent note + tag combinations for the "Continue" row (idle only), 3 shown */
		continueWith?: Combo[];
		onnote: (note: string) => void;
		ontags: (ids: string[]) => void;
		onstart: () => void;
		onstop: () => void;
		ondiscard: () => void;
		oncontinue: (combo: Combo) => void;
		onstartedat: (ms: number) => void;
	} = $props();

	const elapsed = $derived(running ? now - running.started_at : 0);
	const defaults = $derived(app.settings.defaultTagIds);
	const isDefaultSelection = $derived(
		!running &&
			defaults.length > 0 &&
			defaults.length === tagIds.length &&
			defaults.every((id) => tagIds.includes(id)),
	);

	// The note grows with its text up to 400 px (CSS max-height), then scrolls.
	let noteField: HTMLTextAreaElement;
	function fitNote() {
		const border = noteField.offsetHeight - noteField.clientHeight;
		noteField.style.height = "auto";
		noteField.style.height = `${noteField.scrollHeight + border}px`;
	}
	$effect(() => {
		void note;
		fitNote();
	});

	let startedText = $state("");
	$effect(() => {
		startedText = running ? clock(running.started_at) : "";
	});

	/** A new start time on the same day. A time in the future is refused. */
	function commitStarted() {
		if (!running) return;
		const min = parseClock(startedText);
		const ms = min === null ? null : atLocalMinutes(localDate(running.started_at, tz), min, tz);
		if (ms === null || ms > Date.now()) {
			startedText = clock(running.started_at);
			return;
		}
		if (ms !== running.started_at) onstartedat(ms);
	}
</script>

<svelte:window onresize={fitNote} />

<section class="timer" class:running aria-label={strings.timer.label}>
	<div class="top">
		<div>
			<div class="clock clipa-num" role="timer" aria-live="off">{formatElapsed(elapsed)}</div>
			<div class="state">
				<span class="dot" aria-hidden="true"></span>
				{running ? strings.timer.runningSince(clock(running.started_at)) : strings.timer.stopped}
			</div>
		</div>
		<div class="actions">
			{#if running}
				<Button size="lg" variant="secondary" onclick={ondiscard}>{strings.timer.discard}</Button>
				<Button size="lg" variant="stop" icon="stop" kbd="⌘↵" onclick={onstop}>{strings.timer.stop}</Button>
			{:else}
				<Button size="lg" variant="primary" icon="play" kbd="⌘↵" onclick={onstart}>{strings.timer.start}</Button>
			{/if}
		</div>
	</div>

	<div class="field">
		<label for="timer-note">{strings.timer.noteLabel}</label>
		<textarea
			id="timer-note"
			bind:this={noteField}
			rows="2"
			placeholder={strings.timer.notePlaceholder}
			value={note}
			oninput={(e) => onnote(e.currentTarget.value)}
		></textarea>
	</div>

	<div class="row">
		<div class="field grow">
			<label for="timer-tags">{strings.timer.tags}</label>
			<TagInput
				id="timer-tags"
				value={tagIds}
				onchange={ontags}
				hint={isDefaultSelection ? strings.timer.defaultTag : undefined}
			/>
		</div>
		{#if running}
			<div class="field started">
				<label for="timer-started">{strings.timer.startedAt}</label>
				<input
					id="timer-started"
					class="clipa-num"
					bind:value={startedText}
					onblur={commitStarted}
					onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
				/>
			</div>
		{/if}
	</div>

	{#if !running && continueWith.length}
		<div class="continue">
			<span class="continue-label">{strings.timer.continue}</span>
			{#each continueWith.slice(0, 3) as combo, i (i)}
				<button class="pill" type="button" onclick={() => oncontinue(combo)}>
					<span class="sw" style="background: {tagColor(app.tagById.get(combo.tagIds[0]))}" aria-hidden="true"></span>
					{firstLine(combo.note) || strings.common.noNote}
				</button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.timer {
		background: var(--clipa-surface);
		border: 1px solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.timer.running {
		border-color: var(--clipa-tracked-border);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.clock {
		font-size: 56px;
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1;
	}
	.state {
		margin-top: 10px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--clipa-muted);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--clipa-neutral);
	}
	.running .state {
		color: var(--clipa-tracked-text);
	}
	.running .dot {
		background: var(--clipa-tracked);
		box-shadow: 0 0 0 4px var(--clipa-tracked-glow);
	}
	.actions {
		display: flex;
		gap: 10px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--clipa-muted);
	}
	textarea {
		min-height: 64px;
		max-height: 400px;
		resize: none;
		padding: 10px 12px;
		font-size: 15px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.grow {
		flex: 2 1 320px;
	}
	.started {
		flex: 1 1 160px;
	}
	.started input {
		height: 40px;
		padding: 0 12px;
		font-size: 15px;
	}
	.continue {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 4px;
	}
	.continue-label {
		font-size: 12px;
		color: var(--clipa-faint);
		margin-right: 2px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 30px;
		padding: 0 12px;
		border-radius: 15px;
		border: 1px solid var(--clipa-border-strong);
		background: var(--clipa-menu);
		color: var(--clipa-text-2);
		font-size: 13px;
		max-width: 320px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill:hover {
		background: var(--clipa-surface-2);
		color: var(--clipa-text);
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex: none;
	}
</style>
