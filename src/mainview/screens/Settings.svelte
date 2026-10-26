<script lang="ts">
	import type { Tag } from "../../../core/types";
	import TagCombobox from "../components/TagCombobox.svelte";
	import { app } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	let editing = $state<string | null>(null);
	let editName = $state("");
	let confirming = $state<string | null>(null);

	async function setDefaults(ids: string[]) {
		const settings = await app.attempt(() => api.settingsSet({ defaultTagIds: ids }));
		if (settings) app.settings = settings;
	}

	async function rename(tag: Tag) {
		const saved = await app.attempt(() => api.tagsUpsert({ id: tag.id, name: editName }));
		if (saved) {
			editing = null;
			await app.reloadTags();
		}
	}

	async function recolor(tag: Tag, color: string) {
		if (await app.attempt(() => api.tagsUpsert({ id: tag.id, name: tag.name, color }))) await app.reloadTags();
	}

	async function remove(tag: Tag) {
		if (confirming !== tag.id) {
			confirming = tag.id;
			return;
		}
		confirming = null;
		if (await app.attempt(() => api.tagsDelete({ id: tag.id }))) {
			await app.reloadTags();
			app.revision++;
		}
	}
</script>

<section class="settings">
	<div class="card">
		<h2>{strings.settings.defaultTags}</h2>
		<p class="muted">{strings.settings.defaultTagsHint}</p>
		<TagCombobox selected={app.settings.defaultTagIds} onchange={setDefaults} />
	</div>

	<div class="card">
		<h2>{strings.settings.tagsTitle}</h2>
		<p class="muted">{strings.settings.tagsHint}</p>
		{#if app.tags.length === 0}
			<p class="muted">{strings.settings.noTags}</p>
		{/if}
		<ul>
			{#each app.tags as tag (tag.id)}
				<li>
					<input
						type="color"
						value={tag.color ?? "#3b82f6"}
						onchange={(e) => recolor(tag, e.currentTarget.value)}
						aria-label={tag.name}
					/>
					{#if editing === tag.id}
						<form class="rename" onsubmit={(e) => (e.preventDefault(), rename(tag))}>
							<input bind:value={editName} />
							<button type="submit" class="primary">{strings.panel.save}</button>
							<button type="button" onclick={() => (editing = null)}>{strings.panel.cancel}</button>
						</form>
					{:else}
						<span class="name">{tag.name}</span>
						<button
							onclick={() => {
								editing = tag.id;
								editName = tag.name;
							}}>{strings.settings.rename}</button
						>
						<button class="danger" onclick={() => remove(tag)}>
							{confirming === tag.id ? strings.settings.confirmDeleteTag(tag.name) : strings.panel.delete}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<p class="muted">{strings.settings.later}</p>
</section>

<style>
	.settings {
		display: grid;
		gap: 16px;
		max-width: 640px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		border-top: 1px solid var(--border);
	}
	.name {
		flex: 1;
	}
	.rename {
		flex: 1;
		display: flex;
		gap: 6px;
	}
	.rename input {
		flex: 1;
	}
	input[type="color"] {
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		background: none;
	}
</style>
