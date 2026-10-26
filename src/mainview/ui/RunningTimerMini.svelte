<script lang="ts">
	import { firstLine } from "../../../core/entries";
	import { formatElapsed } from "../../../core/time";
	import { strings } from "../strings";

	let { elapsedMs, note, onclick }: { elapsedMs: number; note: string; onclick?: () => void } = $props();
</script>

<button class="mini" {onclick} aria-label={strings.sidebar.openToday(formatElapsed(elapsedMs))}>
	<span class="state"><span class="dot" aria-hidden="true"></span>{strings.sidebar.running}</span>
	<span class="time clipa-num">{formatElapsed(elapsedMs)}</span>
	<span class="note">{firstLine(note) || strings.common.noNote}</span>
</button>

<style>
	.mini {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		padding: 14px;
		text-align: left;
		border: 1px solid var(--clipa-tracked-border);
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
</style>
