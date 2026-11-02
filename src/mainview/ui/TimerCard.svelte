<script lang="ts">
	import { firstLine, type Combo } from "../../../core/entries";
	import { atLocalMinutes, formatElapsed, localDate, parseClock } from "../../../core/time";
	import type { EntryWithTags } from "../../../core/types";
	import { app, clock, tagColor, tz } from "../lib/app.svelte";
	import { shortcut } from "../lib/keys";
	import { strings } from "../strings";
	import Button from "./Button.svelte";
	import Icon from "./Icon.svelte";
	import TagInput from "./TagInput.svelte";

	// ⌘↵ (Ctrl+↵) starts and stops the timer; App.svelte listens for it on the window.
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
	const time = $derived(formatElapsed(elapsed));
	/** Unlit LCD segments behind the digits, visible in themes that set --clipa-clock-ghost */
	const ghost = $derived(time.replace(/\d/g, "8"));
	const round = $derived(app.traits.timerButton === "round");
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
		// A theme change can put the note in a new field with its own style.
		void [note, round];
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

{#snippet clockFace()}
	<div class="clock-wrap">
		<span class="ghost clipa-num" aria-hidden="true">{ghost}</span>
		<div class="clock clipa-num" role="timer" aria-live="off">{time}</div>
	</div>
{/snippet}

{#snippet statusLine()}
	<div class="state">
		<span class="dot" aria-hidden="true"></span>
		{running ? strings.timer.runningSince(clock(running.started_at)) : strings.timer.stopped}
	</div>
{/snippet}

{#snippet fields()}
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
{/snippet}

{#snippet continueRow()}
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
{/snippet}

<section class="timer" class:running class:round aria-label={strings.timer.label}>
	{#if app.traits.stripe}<div class="stripe" aria-hidden="true"></div>{/if}
	{#if round}
		<!-- Retro: the clock on an LCD panel and a big round key -->
		<div class="body round-body">
			<div class="main">
				{@render statusLine()}
				{@render clockFace()}
				{@render fields()}
			</div>
			<div class="side">
				{#if running}
					<button class="key stop" type="button" onclick={onstop}><Icon name="stop" size={22} />{strings.timer.stop}</button>
				{:else}
					<button class="key go" type="button" onclick={onstart}><Icon name="play" size={26} />{strings.timer.start}</button>
				{/if}
				<span class="hint">
					{shortcut("↵")}
					{#if running}· <button class="link" type="button" onclick={ondiscard}>{strings.timer.discard}</button>{/if}
				</span>
			</div>
		</div>
		{@render continueRow()}
	{:else}
		<div class="body">
			<div class="top">
				<div>
					{@render clockFace()}
					{@render statusLine()}
				</div>
				<div class="actions">
					{#if running}
						<Button size="lg" variant="secondary" onclick={ondiscard}>{strings.timer.discard}</Button>
						<Button size="lg" variant="stop" icon="stop" kbd={shortcut("↵")} onclick={onstop}>{strings.timer.stop}</Button>
					{:else}
						<Button size="lg" variant="primary" icon="play" kbd={shortcut("↵")} onclick={onstart}>{strings.timer.start}</Button>
					{/if}
				</div>
			</div>
			{@render fields()}
			{@render continueRow()}
		</div>
	{/if}
</section>

<style>
	.timer {
		background: var(--clipa-surface);
		border: var(--clipa-bw) solid var(--clipa-border);
		border-radius: var(--clipa-r-card);
		box-shadow: var(--clipa-timer-shadow);
		overflow: hidden;
	}
	.timer.running {
		border-color: var(--clipa-tracked-border);
	}
	.body {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	/* The clock: plain digits in dark, an LCD panel in retro (all from tokens) */
	.clock-wrap {
		position: relative;
		width: fit-content;
		padding: var(--clipa-clock-pad);
		border: var(--clipa-clock-border);
		border-radius: var(--clipa-r-lg);
		background: var(--clipa-clock-bg);
	}
	.clock,
	.ghost {
		font-family: var(--clipa-clock-font);
		font-size: var(--clipa-clock-size);
		font-weight: 600;
		letter-spacing: -0.03em;
		line-height: 1;
	}
	.clock {
		position: relative;
		color: var(--clipa-clock-idle-fg);
	}
	.running .clock {
		color: var(--clipa-clock-fg);
		text-shadow: var(--clipa-clock-glow);
	}
	.ghost {
		position: absolute;
		color: var(--clipa-clock-ghost);
		pointer-events: none;
		user-select: none;
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
		font-family: var(--clipa-label-font);
		font-size: 12px;
		font-weight: 600;
		color: var(--clipa-muted);
		text-transform: var(--clipa-label-transform);
		letter-spacing: var(--clipa-label-spacing);
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
		font-family: var(--clipa-label-font);
		font-size: 12px;
		color: var(--clipa-faint);
		margin-right: 2px;
		text-transform: var(--clipa-label-transform);
		letter-spacing: var(--clipa-label-spacing);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 30px;
		padding: 0 12px;
		border-radius: 15px;
		border: var(--clipa-bw) solid var(--clipa-border-strong);
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

	/* Retro */
	.stripe {
		height: 10px;
		border-bottom: var(--clipa-bw) solid var(--clipa-ink);
		background: linear-gradient(
			to bottom,
			var(--clipa-tracked) 0 33.3%,
			var(--clipa-danger) 33.3% 66.6%,
			var(--clipa-event) 66.6%
		);
	}
	.round-body {
		padding: 26px 30px 30px;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 28px;
	}
	.main {
		flex: 999 1 460px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.side {
		flex: 1 1 170px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.round .clock-wrap {
		box-shadow: inset 0 3px 0 rgba(0, 0, 0, 0.35);
	}
	.round .clock,
	.round .ghost {
		font-weight: 700;
		letter-spacing: -0.04em;
	}
	.round .state {
		margin-top: 0;
		align-self: flex-start;
		height: 28px;
		padding: 0 12px;
		border: 1.5px solid var(--clipa-ink);
		border-radius: var(--clipa-r-sm);
		background: var(--clipa-field);
		color: var(--clipa-text);
		font-family: var(--clipa-label-font);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: var(--clipa-label-spacing);
		text-transform: var(--clipa-label-transform);
	}
	.round .dot {
		border: 1.5px solid var(--clipa-ink);
		background: var(--clipa-neutral);
		box-shadow: none;
	}
	.round.running .state {
		background: var(--clipa-accent);
		color: var(--clipa-on-accent);
	}
	.round.running .dot {
		background: var(--clipa-danger);
	}
	.key {
		width: 150px;
		height: 150px;
		border-radius: 50%;
		border: var(--clipa-bw) solid var(--clipa-ink);
		box-shadow:
			5px 5px 0 var(--clipa-ink),
			inset 0 -6px 0 rgba(0, 0, 0, 0.16);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--clipa-ink);
		font-family: var(--clipa-display-font);
		font-size: 24px;
		font-weight: 900;
		font-stretch: var(--clipa-display-stretch);
		text-transform: uppercase;
		transition:
			transform 80ms,
			box-shadow 80ms;
	}
	.key:active {
		transform: translate(3px, 3px);
		box-shadow:
			2px 2px 0 var(--clipa-ink),
			inset 0 -3px 0 rgba(0, 0, 0, 0.16);
	}
	.go {
		background: var(--clipa-accent);
	}
	.stop {
		background: var(--clipa-danger);
	}
	.hint {
		font-family: var(--clipa-label-font);
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.link {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--clipa-text);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-transform: lowercase;
	}
	/* The note is a big underlined line */
	.round textarea {
		min-height: 48px;
		padding: 6px 2px;
		border: 0;
		border-bottom: var(--clipa-bw) solid var(--clipa-ink);
		border-radius: 0;
		background: transparent;
		font-family: var(--clipa-display-font);
		font-size: 24px;
		font-weight: 700;
	}
	.round .continue {
		padding: 0 30px 26px;
	}
	.round .pill {
		border-radius: var(--clipa-r);
		background: var(--clipa-field);
		box-shadow: 2px 2px 0 var(--clipa-ink);
	}
</style>
