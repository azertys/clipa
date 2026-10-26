<script lang="ts">
	import { app } from "../lib/app.svelte";

	let { ids }: { ids: string[] } = $props();

	const tags = $derived(
		ids
			.map((id) => app.tagById.get(id))
			.filter((t) => t !== undefined)
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
</script>

<span class="tags">
	{#each tags as tag (tag.id)}
		<span class="tag" style:--chip={tag.color ?? "var(--accent)"}>{tag.name}</span>
	{/each}
</span>

<style>
	.tags {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.tag {
		font-size: 11px;
		padding: 1px 7px;
		border-radius: 9px;
		background: color-mix(in srgb, var(--chip) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--chip) 40%, transparent);
	}
</style>
