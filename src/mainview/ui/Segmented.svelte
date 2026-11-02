<script lang="ts" generics="T extends string | number">
	let {
		options,
		value,
		label,
		size = "md",
		onchange,
	}: {
		options: { value: T; label: string }[];
		value: T;
		/** Accessible group name */
		label: string;
		/** md: 36 px (toolbars). sm: 32 px (settings rows). */
		size?: "sm" | "md";
		onchange: (value: T) => void;
	} = $props();
</script>

<div class="seg {size}" role="group" aria-label={label}>
	{#each options as opt (opt.value)}
		<button type="button" aria-pressed={opt.value === value} class:on={opt.value === value} onclick={() => onchange(opt.value)}>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		flex-wrap: wrap;
		padding: 3px;
		border: var(--clipa-bw) solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-md);
		background: var(--clipa-surface);
	}
	.md {
		min-height: 36px;
	}
	.sm {
		min-height: 32px;
		border-radius: var(--clipa-r);
		background: var(--clipa-field);
	}
	button {
		border: 0;
		border-radius: var(--clipa-r-sm);
		background: transparent;
		color: var(--clipa-text-2);
		padding: 0 12px;
		font-family: var(--clipa-nav-font);
		font-size: 13px;
		white-space: nowrap;
		text-transform: var(--clipa-nav-transform);
	}
	.md button {
		height: 28px;
	}
	.sm button {
		height: 24px;
		padding: 0 10px;
		font-size: 12px;
		border-radius: 5px;
	}
	button:hover:not(.on) {
		color: var(--clipa-text);
	}
	.on {
		background: var(--clipa-seg-active-bg);
		color: var(--clipa-seg-active-fg);
		font-weight: 600;
	}
	/* Retro: separate keys in place of one track */
	:global(:root[data-theme="retro"]) .seg {
		padding: 0;
		gap: 6px;
		border: 0;
		background: transparent;
	}
	:global(:root[data-theme="retro"]) .seg button {
		height: 34px;
		padding: 0 14px;
		border: 2px solid var(--clipa-ink);
		border-radius: var(--clipa-r-pill);
		background: var(--clipa-surface);
		color: var(--clipa-text);
	}
	:global(:root[data-theme="retro"]) .seg button.on {
		background: var(--clipa-seg-active-bg);
		color: var(--clipa-seg-active-fg);
	}
	:global(:root[data-theme="retro"]) .seg.sm button {
		height: 30px;
		padding: 0 10px;
	}
</style>
