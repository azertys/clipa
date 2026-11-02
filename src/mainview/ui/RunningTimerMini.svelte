<script lang="ts">
	import { firstLine } from "../../../core/entries";
	import { formatElapsed } from "../../../core/time";
	import { strings } from "../strings";

	let {
		elapsedMs,
		note,
		compact = false,
		onclick,
	}: {
		elapsedMs: number;
		note: string;
		/** One-line pill for the top bar */
		compact?: boolean;
		onclick?: () => void;
	} = $props();

	const time = $derived(formatElapsed(elapsedMs));
</script>

{#if compact}
	<button class="pill clipa-num" {onclick} aria-label={strings.sidebar.openToday(time)} title={firstLine(note)}>
		<span class="dot" aria-hidden="true"></span>{time}
	</button>
{:else}
	<button class="mini" {onclick} aria-label={strings.sidebar.openToday(time)}>
		<span class="state"><span class="dot" aria-hidden="true"></span>{strings.sidebar.running}</span>
		<span class="time clipa-num">{time}</span>
		<span class="note">{firstLine(note) || strings.common.noNote}</span>
	</button>
{/if}

<style>
	.mini {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		padding: 14px;
		text-align: left;
		border: var(--clipa-bw) solid var(--clipa-tracked-border);
		background: var(--clipa-tracked-bg);
		border-radius: var(--clipa-r-lg);
		color: var(--clipa-text);
	}
	.state {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--clipa-tracked-text);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--clipa-tracked);
	}
	.time {
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.note {
		font-size: 12px;
		color: var(--clipa-text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The top bar pill: the time on the clock's panel (an LCD in retro) */
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 12px;
		border: var(--clipa-bw) solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-pill);
		background: var(--clipa-tracked-bg);
		color: var(--clipa-clock-fg);
		font-size: 14px;
		font-weight: 700;
	}
	.pill .dot {
		background: var(--clipa-danger);
	}
</style>
