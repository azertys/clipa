<script lang="ts">
	import { formatDuration } from "../../../core/time";
	import { strings } from "../strings";

	let { todayMs, weekMs }: { todayMs: number; weekMs: number } = $props();
</script>

<div class="summary">
	<div class="row"><span>{strings.sidebar.today}</span><span class="v clipa-num">{formatDuration(todayMs)}</span></div>
	<div class="row"><span>{strings.sidebar.thisWeek}</span><span class="v clipa-num">{formatDuration(weekMs)}</span></div>
</div>

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--clipa-sidebar-border);
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
</style>
