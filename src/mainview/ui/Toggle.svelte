<script lang="ts">
	let {
		checked = false,
		label,
		disabled = false,
		onchange,
	}: {
		checked?: boolean;
		/** Accessible name */
		label: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	class="switch"
	class:on={checked}
	onclick={() => onchange?.(!checked)}
>
	<span class="knob"></span>
</button>

<style>
	.switch {
		flex: none;
		width: 40px;
		height: 24px;
		padding: 2px;
		border: 0;
		border-radius: 12px;
		background: var(--clipa-border-raised);
		display: flex;
		align-items: center;
		transition: background-color 150ms;
	}
	.switch:disabled {
		opacity: 0.5;
	}
	.knob {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--clipa-text-2);
		transition:
			transform 150ms,
			background-color 150ms;
	}
	.on {
		background: var(--clipa-accent);
	}
	.on .knob {
		transform: translateX(16px);
		background: var(--clipa-knob-on);
	}
</style>
