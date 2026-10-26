<script lang="ts">
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";

	let {
		label,
		onprev,
		onnext,
		onpick,
		nextDisabled = false,
	}: {
		/** "Last 7 days · 20 – 26 Oct" */
		label: string;
		onprev: () => void;
		onnext: () => void;
		/** Click on the label */
		onpick?: () => void;
		nextDisabled?: boolean;
	} = $props();
</script>

<div class="stepper">
	<button class="arrow" type="button" aria-label={strings.entries.prevRange} onclick={onprev}>
		<Icon name="chevron-left" size={14} strokeWidth={2} />
	</button>
	<button class="mid" type="button" title={strings.entries.currentRange} onclick={() => onpick?.()}>
		<span class="cal"><Icon name="calendar" size={14} /></span>{label}
	</button>
	<button class="arrow" type="button" aria-label={strings.entries.nextRange} onclick={onnext} disabled={nextDisabled}>
		<Icon name="chevron-right" size={14} strokeWidth={2} />
	</button>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: stretch;
		height: 36px;
		border: 1px solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-md);
		background: var(--clipa-surface);
		overflow: hidden;
	}
	button {
		border: 0;
		background: transparent;
		color: var(--clipa-text-2);
	}
	button:hover:not(:disabled) {
		background: var(--clipa-surface-2);
		color: var(--clipa-text);
	}
	button:disabled {
		opacity: 0.4;
	}
	.arrow {
		width: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mid {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border-left: 1px solid var(--clipa-border-strong);
		border-right: 1px solid var(--clipa-border-strong);
		color: var(--clipa-text);
		font-size: 13px;
		white-space: nowrap;
	}
	.cal {
		color: var(--clipa-muted);
		display: inline-flex;
	}
</style>
