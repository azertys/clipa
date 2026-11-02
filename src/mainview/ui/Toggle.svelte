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
		border: var(--clipa-toggle-border);
		border-radius: var(--clipa-toggle-radius);
		background: var(--clipa-toggle-off);
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
		border-radius: var(--clipa-knob-radius);
		background: var(--clipa-toggle-knob);
		transition:
			transform 150ms,
			background-color 150ms;
	}
	.on {
		background: var(--clipa-toggle-on);
	}
	.on .knob {
		transform: translateX(16px);
		background: var(--clipa-toggle-knob-on);
	}
	:global(:root[data-theme="retro"]) .switch {
		width: 48px;
		height: 28px;
		padding: 3px;
	}
	:global(:root[data-theme="retro"]) .knob {
		width: 18px;
		height: 18px;
		border: 1.5px solid var(--clipa-ink);
	}
	:global(:root[data-theme="retro"]) .on .knob {
		transform: translateX(20px);
	}
</style>
