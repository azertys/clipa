<script lang="ts">
	import { formatDuration } from "../../../core/time";
	import { strings } from "../strings";

	let {
		todayMs,
		weekMs,
		compact = false,
	}: {
		todayMs: number;
		weekMs: number;
		/** One line for the top bar */
		compact?: boolean;
	} = $props();
</script>

{#if compact}
	<span class="line">
		{strings.sidebar.today} <strong class="clipa-num">{formatDuration(todayMs)}</strong> · {strings.sidebar.thisWeek}
		<strong class="clipa-num">{formatDuration(weekMs)}</strong>
	</span>
{:else}
	<div class="summary">
		<div class="row"><span>{strings.sidebar.today}</span><span class="v clipa-num">{formatDuration(todayMs)}</span></div>
		<div class="row"><span>{strings.sidebar.thisWeek}</span><span class="v clipa-num">{formatDuration(weekMs)}</span></div>
	</div>
{/if}

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: var(--clipa-bw) solid var(--clipa-sidebar-border);
		border-radius: var(--clipa-r-lg);
	}
	.row {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.v {
		color: var(--clipa-text);
	}
	.line {
		font-family: var(--clipa-label-font);
		font-size: 13px;
		color: var(--clipa-text-2);
		text-transform: var(--clipa-copy-transform);
	}
	.line strong {
		color: var(--clipa-text);
	}
</style>
