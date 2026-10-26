<script lang="ts">
	import { icons, type IconName } from "./icons";

	let {
		name,
		size = 16,
		strokeWidth = 1.8,
		label,
	}: { name: IconName; size?: number; strokeWidth?: number; label?: string } = $props();

	const icon = $derived(icons[name]);
	const filled = $derived("fill" in icon && icon.fill === true);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={filled ? "currentColor" : "none"}
	stroke={filled ? "none" : "currentColor"}
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? "img" : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : "true"}
	style="flex: none"
>
	<path d={icon.d} />
</svg>
