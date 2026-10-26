<script lang="ts">
	import type { HTMLButtonAttributes } from "svelte/elements";
	import Icon from "./Icon.svelte";
	import type { IconName } from "./icons";

	let {
		icon,
		label,
		tone = "default",
		size = 32,
		iconSize = 15,
		...rest
	}: HTMLButtonAttributes & {
		icon: IconName;
		/** The accessible name, also shown as the tooltip */
		label: string;
		tone?: "default" | "danger";
		size?: number;
		iconSize?: number;
	} = $props();
</script>

<button
	class="icon-btn {tone}"
	type="button"
	aria-label={label}
	title={label}
	style="width: {size}px; height: {size}px"
	{...rest}
>
	<Icon name={icon} size={iconSize} />
</button>

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		border-radius: var(--clipa-r);
		background: transparent;
		color: var(--clipa-muted);
		flex: none;
	}
	.icon-btn:hover {
		background: var(--clipa-surface-2);
		color: var(--clipa-text);
	}
	.danger {
		color: var(--clipa-danger-text);
	}
	.danger:hover {
		color: var(--clipa-danger-text);
		background: var(--clipa-danger-tint);
	}
</style>
