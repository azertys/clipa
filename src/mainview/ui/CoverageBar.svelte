<script lang="ts">
	let {
		value,
		tone = "auto",
		height = 4,
		warnBelow = 0.75,
		label,
	}: {
		/** 0..1 */
		value: number;
		/** auto: green, or amber below `warnBelow` */
		tone?: "auto" | "tracked" | "event" | "accent" | "neutral";
		height?: number;
		warnBelow?: number;
		/** Accessible name; without it the bar is decorative */
		label?: string;
	} = $props();

	const pct = $derived(Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10);
	const color = $derived(
		tone === "auto"
			? value < warnBelow
				? "var(--clipa-event)"
				: "var(--clipa-tracked)"
			: tone === "tracked"
				? "var(--clipa-tracked)"
				: tone === "event"
					? "var(--clipa-event)"
					: tone === "accent"
						? "var(--clipa-accent)"
						: "var(--clipa-neutral)",
	);
</script>

<div
	class="bar"
	style="height: {height}px; border-radius: {height / 2}px"
	role={label ? "meter" : undefined}
	aria-label={label}
	aria-valuenow={label ? pct : undefined}
	aria-valuemin={label ? 0 : undefined}
	aria-valuemax={label ? 100 : undefined}
	aria-hidden={label ? undefined : "true"}
>
	<div class="fill" style="width: {pct}%; background: {color}; border-radius: {height / 2}px"></div>
</div>

<style>
	.bar {
		background: var(--clipa-track);
		overflow: hidden;
		flex: 1 1 auto;
		min-width: 0;
	}
	.fill {
		height: 100%;
		transition: width 200ms ease;
	}
</style>
