<script lang="ts">
	import { app } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	let {
		selected = $bindable([]),
		onchange,
		id,
	}: { selected?: string[]; onchange?: (ids: string[]) => void; id?: string } = $props();

	const listId = `tags-${Math.random().toString(36).slice(2)}`;
	let text = $state("");
	let open = $state(false);
	let active = $state(0);
	let input: HTMLInputElement;

	const query = $derived(text.trim().toLowerCase());
	const matches = $derived(
		app.tags.filter((t) => !selected.includes(t.id) && t.name.toLowerCase().includes(query)).slice(0, 8),
	);
	const exact = $derived(app.tags.some((t) => t.name.toLowerCase() === query));
	// The options: matching tags, then "Create …" when the text is a new name.
	const options = $derived([
		...matches.map((t) => ({ kind: "tag" as const, id: t.id, label: t.name, color: t.color })),
		...(query && !exact ? [{ kind: "create" as const, id: "", label: strings.tags.create(text.trim()), color: null }] : []),
	]);

	function set(ids: string[]) {
		selected = ids;
		onchange?.(ids);
	}

	async function choose(index: number) {
		const option = options[index];
		if (!option) return;
		if (option.kind === "tag") {
			set([...selected, option.id]);
		} else {
			const tag = await app.attempt(() => api.tagsUpsert({ name: text.trim() }));
			if (!tag) return;
			await app.reloadTags();
			if (!selected.includes(tag.id)) set([...selected, tag.id]);
		}
		text = "";
		active = 0;
		input.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "ArrowDown") {
			open = true;
			active = Math.min(active + 1, options.length - 1);
			e.preventDefault();
		} else if (e.key === "ArrowUp") {
			active = Math.max(active - 1, 0);
			e.preventDefault();
		} else if (e.key === "Enter" && !e.metaKey) {
			if (options.length) {
				e.preventDefault();
				void choose(active);
			}
		} else if (e.key === "Backspace" && text === "" && selected.length) {
			set(selected.slice(0, -1));
		} else if (e.key === "Escape") {
			open = false;
		}
	}
</script>

<div class="combo">
	{#each selected as tagId (tagId)}
		{@const tag = app.tagById.get(tagId)}
		{#if tag}
			<span class="chip" style:--chip={tag.color ?? "var(--accent)"}>
				{tag.name}
				<button type="button" aria-label={strings.tags.remove(tag.name)} onclick={() => set(selected.filter((x) => x !== tagId))}>×</button>
			</span>
		{/if}
	{/each}
	<input
		bind:this={input}
		bind:value={text}
		{id}
		role="combobox"
		aria-expanded={open && options.length > 0}
		aria-controls={listId}
		aria-autocomplete="list"
		placeholder={selected.length ? "" : strings.tags.placeholder}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		oninput={() => {
			open = true;
			active = 0;
		}}
		{onkeydown}
	/>
	{#if open && options.length}
		<ul class="list" id={listId} role="listbox">
			{#each options as option, i (option.kind + option.id)}
				<li
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					class:create={option.kind === "create"}
					onmousedown={(e) => {
						e.preventDefault();
						void choose(i);
					}}
				>
					{#if option.kind === "tag"}<span class="dot" style:background={option.color ?? "var(--accent)"}></span>{/if}
					{option.label}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.combo {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		padding: 4px 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--field);
		min-height: 32px;
	}
	.combo:focus-within {
		border-color: var(--accent);
	}
	input {
		flex: 1;
		min-width: 80px;
		border: none;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 2px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 1px 4px 1px 8px;
		border-radius: 10px;
		font-size: 12px;
		background: color-mix(in srgb, var(--chip) 18%, transparent);
		border: 1px solid color-mix(in srgb, var(--chip) 45%, transparent);
	}
	.chip button {
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		padding: 0 4px;
		font-size: 13px;
		line-height: 1;
	}
	.list {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 20;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 4px;
		cursor: pointer;
	}
	li.active {
		background: var(--hover);
	}
	li.create {
		color: var(--accent);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
</style>
