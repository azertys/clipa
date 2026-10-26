<script lang="ts">
	import type { Tag } from "../../../core/types";
	import { tagColor } from "../lib/app.svelte";
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";

	let {
		tag,
		size = "sm",
		onremove,
	}: {
		tag: Pick<Tag, "id" | "name" | "color">;
		/** sm: in lists (22 px). md: in inputs (26 px). */
		size?: "sm" | "md";
		/** Shows the × button when set */
		onremove?: (tag: Pick<Tag, "id" | "name" | "color">) => void;
	} = $props();
</script>

<span class="chip {size}" class:removable={!!onremove} style="--tag: {tagColor(tag)}">
	<span class="swatch" aria-hidden="true"></span>
	<span class="name">{tag.name}</span>
	{#if onremove}
		<button class="x" type="button" aria-label={strings.tags.remove(tag.name)} onclick={() => onremove(tag)}>
			<Icon name="close" size={10} strokeWidth={2.5} />
		</button>
	{/if}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: var(--clipa-r-sm);
		background: color-mix(in srgb, var(--tag) 16%, var(--clipa-surface));
		color: color-mix(in srgb, var(--tag) 22%, var(--clipa-chip-text-base));
		white-space: nowrap;
		flex: none;
	}
	.sm {
		height: 22px;
		padding: 0 8px;
		font-size: 12px;
	}
	.md {
		height: 26px;
		padding: 0 9px;
		font-size: 13px;
	}
	.removable {
		padding-right: 4px;
	}
	.swatch {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		background: var(--tag);
	}
	.md .swatch {
		width: 8px;
		height: 8px;
	}
	.x {
		width: 20px;
		height: 20px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--clipa-r-xs);
		background: transparent;
		color: inherit;
		opacity: 0.75;
	}
	.x:hover {
		opacity: 1;
		background: var(--clipa-chip-hover);
	}
</style>
