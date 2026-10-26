<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		label,
		description,
		for: forId,
		stacked = false,
		control,
	}: {
		label: string;
		description?: string;
		/** id of the control, so the label is a real <label> */
		for?: string;
		/** The control goes under the text (wide inputs) */
		stacked?: boolean;
		control: Snippet;
	} = $props();
</script>

<div class="row" class:stacked>
	<div class="text">
		{#if forId}<label for={forId} class="label">{label}</label>{:else}<div class="label">{label}</div>{/if}
		{#if description}<div class="desc">{description}</div>{/if}
	</div>
	<div class="control">{@render control()}</div>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		padding: 12px 0;
		border-top: 1px solid var(--clipa-divider);
	}
	.stacked {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}
	.text {
		min-width: 0;
		flex: 1 1 260px;
	}
	.stacked .text {
		flex: none;
	}
	.label {
		font-size: 14px;
		display: block;
	}
	.desc {
		font-size: 12px;
		color: var(--clipa-muted);
		overflow-wrap: anywhere;
	}
	.control {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.control :global(select) {
		height: 32px;
	}
</style>
