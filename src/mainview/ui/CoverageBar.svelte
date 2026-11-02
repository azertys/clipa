<script lang="ts">
	import { app } from "../lib/app.svelte";

	let {
		value,
		tone = "auto",
		variant = "auto",
		height = 4,
		warnBelow = 0.75,
		label,
	}: {
		/** 0..1 */
		value: number;
		/** auto: the tracked color, or the warning color below `warnBelow` */
		tone?: "auto" | "tracked" | "event" | "accent" | "app" | "neutral";
		/** auto: the theme decides (a thin bar or 10 squares) */
		variant?: "auto" | "bar" | "squares";
		height?: number;
		warnBelow?: number;
		/** Accessible name; without it the meter is decorative */
		label?: string;
	} = $props();

	const v = $derived(Math.min(1, Math.max(0, value)));
	const pct = $derived(Math.round(v * 1000) / 10);
	const squares = $derived(variant === "squares" || (variant === "auto" && app.traits.coverage === "squares"));
	const filled = $derived(Math.round(v * 10));
	const color = $derived(
		tone === "auto"
			? v < warnBelow
				? squares
					? "var(--clipa-danger)"
					: "var(--clipa-event)"
				: "var(--clipa-tracked)"
			: tone === "tracked"
				? "var(--clipa-tracked)"
				: tone === "event"
					? "var(--clipa-event)"
					: tone === "accent"
						? "var(--clipa-accent)"
						: tone === "app"
							? "var(--clipa-app-bar)"
							: "var(--clipa-neutral)",
	);
	const a11y = $derived(
		label
			? { role: "meter", "aria-label": label, "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }
			: { "aria-hidden": "true" as const },
	);
</script>

{#if squares}
	<span class="squares" {...a11y}>
		{#each { length: 10 } as _, i (i)}
			<span class="sq" style={i < filled ? `background: ${color}` : undefined}></span>
		{/each}
	</span>
{:else}
	<div class="bar" style="height: {height}px; border-radius: {height / 2}px" {...a11y}>
		<div class="fill" style="width: {pct}%; background: {color}; border-radius: {height / 2}px"></div>
	</div>
{/if}

<style>
	.bar {
		background: var(--clipa-track);
		overflow: hidden;
		flex: 1 1 auto;
		min-width: 0;
		border: var(--clipa-seg-border);
	}
	.fill {
		height: 100%;
		transition: width 200ms ease;
	}
	:global(:root[data-theme="retro"]) .bar {
		height: 12px !important;
		border-radius: 2px !important;
	}
	:global(:root[data-theme="retro"]) .fill {
		border-radius: 0 !important;
		border-right: 1.5px solid var(--clipa-ink);
	}
	.squares {
		display: inline-flex;
		gap: 3px;
		flex: none;
	}
	.sq {
		width: 11px;
		height: 11px;
		border: 1.5px solid var(--clipa-ink);
		border-radius: 1px;
		background: var(--clipa-sq-empty, var(--clipa-track));
	}
</style>
