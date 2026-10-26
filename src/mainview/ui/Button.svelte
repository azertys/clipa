<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";
	import Icon from "./Icon.svelte";
	import type { IconName } from "./icons";

	type Variant = "primary" | "secondary" | "ghost" | "danger" | "stop" | "outline";
	type Size = "sm" | "md" | "lg";

	let {
		variant = "secondary",
		size = "md",
		icon,
		kbd,
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: Variant;
		size?: Size;
		icon?: IconName;
		/** Keyboard hint at the end, for example "⌘↵" */
		kbd?: string;
		children?: Snippet;
	} = $props();
</script>

<button class="btn {variant} {size}" type="button" {...rest}>
	{#if icon}<Icon name={icon} size={size === "lg" ? 14 : 13} strokeWidth={2.5} />{/if}
	{@render children?.()}
	{#if kbd}<span class="kbd">{kbd}</span>{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px solid transparent;
		border-radius: var(--clipa-r);
		font-weight: 550;
		white-space: nowrap;
		transition:
			background-color 120ms,
			border-color 120ms,
			filter 120ms;
	}
	.btn:disabled {
		opacity: 0.5;
	}

	.sm {
		height: 30px;
		padding: 0 12px;
		font-size: 13px;
	}
	.md {
		height: 36px;
		padding: 0 14px;
		font-size: 13px;
		border-radius: var(--clipa-r-md);
	}
	.lg {
		height: 48px;
		padding: 0 20px;
		font-size: 15px;
		font-weight: 650;
		gap: 10px;
		border-radius: var(--clipa-r-lg);
	}

	.primary {
		background: var(--clipa-accent);
		color: var(--clipa-on-accent);
		font-weight: 650;
	}
	.primary:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.stop {
		background: var(--clipa-danger);
		color: var(--clipa-on-danger);
		font-weight: 650;
	}
	.stop:hover:not(:disabled) {
		filter: brightness(1.06);
	}
	.secondary {
		background: var(--clipa-surface-2);
		border-color: var(--clipa-border-raised);
		color: var(--clipa-text);
	}
	.secondary:hover:not(:disabled) {
		background: var(--clipa-raised-hover);
	}
	.outline {
		background: transparent;
		border-color: var(--clipa-border-strong);
		color: var(--clipa-text-2);
	}
	.outline:hover:not(:disabled) {
		background: var(--clipa-surface-2);
	}
	.ghost {
		background: transparent;
		color: var(--clipa-text-2);
	}
	.ghost:hover:not(:disabled) {
		background: var(--clipa-surface-2);
	}
	.danger {
		background: transparent;
		color: var(--clipa-danger-text);
	}
	.danger:hover:not(:disabled) {
		background: var(--clipa-danger-tint);
	}

	.kbd {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 5px;
		background: var(--clipa-kbd-bg);
	}
</style>
