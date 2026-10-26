<script lang="ts">
	import type { Tag } from "../../../core/types";
	import { app, tagColor } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import TagChip from "./TagChip.svelte";

	// ↑ and ↓ move in the list. ↵ or a comma adds the tag, or creates it. ⌫ on an empty field
	// removes the last tag. Esc closes the list.
	let {
		value,
		onchange,
		id = `tags-${Math.random().toString(36).slice(2, 8)}`,
		placeholder = strings.tags.placeholder,
		hint,
		height = 40,
	}: {
		/** Selected tag ids */
		value: string[];
		onchange: (ids: string[]) => void;
		id?: string;
		placeholder?: string;
		/** Small grey text at the right end, for example "Default tag" */
		hint?: string;
		height?: number;
	} = $props();

	let text = $state("");
	let open = $state(false);
	let highlighted = $state(0);

	const selected = $derived(value.map((v) => app.tagById.get(v)).filter((t): t is Tag => !!t));
	const query = $derived(text.trim().toLowerCase());
	const suggestions = $derived(
		app.tags.filter((t) => !value.includes(t.id) && (!query || t.name.toLowerCase().includes(query))).slice(0, 6),
	);
	const canCreate = $derived(query.length > 0 && !app.tags.some((t) => t.name.toLowerCase() === query));
	const listId = $derived(`${id}-list`);

	function add(tag: Tag) {
		if (!value.includes(tag.id)) onchange([...value, tag.id]);
		text = "";
		highlighted = 0;
	}

	async function create() {
		const tag = await app.attempt(() => api.tagsUpsert({ name: text.trim() }));
		if (!tag) return;
		await app.reloadTags();
		add(tag);
	}

	function choose(index: number) {
		if (index < suggestions.length) add(suggestions[index]);
		else if (canCreate) void create();
	}

	function onkeydown(e: KeyboardEvent) {
		const count = suggestions.length + (canCreate ? 1 : 0);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			open = true;
			highlighted = count ? (highlighted + 1) % count : 0;
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			highlighted = count ? (highlighted - 1 + count) % count : 0;
		} else if (e.key === "Enter" || e.key === ",") {
			// An empty field lets ↵ and ⌘↵ pass through.
			if (!text.trim() && e.key === "Enter") return;
			e.preventDefault();
			e.stopPropagation();
			choose(highlighted);
		} else if (e.key === "Backspace" && text === "" && value.length) {
			onchange(value.slice(0, -1));
		} else if (e.key === "Escape" && open) {
			e.stopPropagation();
			open = false;
		}
	}
</script>

<div class="field" style="min-height: {height}px">
	{#each selected as tag (tag.id)}
		<TagChip {tag} size="md" onremove={(t) => onchange(value.filter((v) => v !== t.id))} />
	{/each}
	<div class="combo">
		<input
			{id}
			bind:value={text}
			{placeholder}
			autocomplete="off"
			style="height: {height - 10}px"
			role="combobox"
			aria-expanded={open && (suggestions.length > 0 || canCreate)}
			aria-controls={listId}
			aria-autocomplete="list"
			onfocus={() => (open = true)}
			onblur={() => setTimeout(() => (open = false), 120)}
			oninput={() => {
				open = true;
				highlighted = 0;
			}}
			{onkeydown}
		/>
		{#if open && (suggestions.length > 0 || canCreate)}
			<ul class="menu" id={listId} role="listbox">
				{#each suggestions as tag, i (tag.id)}
					<li
						role="option"
						aria-selected={i === highlighted}
						class:hl={i === highlighted}
						onmousedown={(e) => {
							e.preventDefault();
							add(tag);
						}}
					>
						<span class="sw" style="background: {tagColor(tag)}"></span>{tag.name}
					</li>
				{/each}
				{#if canCreate}
					<li
						role="option"
						aria-selected={highlighted === suggestions.length}
						class:hl={highlighted === suggestions.length}
						onmousedown={(e) => {
							e.preventDefault();
							void create();
						}}
					>
						{strings.tags.create(text.trim())}
					</li>
				{/if}
			</ul>
		{/if}
	</div>
	{#if hint}<span class="hint">{hint}</span>{/if}
</div>

<style>
	.field {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		padding: 4px 8px;
		border-radius: var(--clipa-r);
		border: 1px solid var(--clipa-border-strong);
		background: var(--clipa-field);
	}
	.field:focus-within {
		border-color: var(--clipa-accent);
	}
	.combo {
		position: relative;
		flex: 1;
		min-width: 100px;
	}
	.combo input {
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		outline: none;
		font-size: 14px;
	}
	.hint {
		font-size: 12px;
		color: var(--clipa-faint);
	}
	.menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		left: -8px;
		min-width: 200px;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--clipa-menu);
		border: 1px solid var(--clipa-border-raised);
		border-radius: var(--clipa-r-lg);
		box-shadow: var(--clipa-shadow);
	}
	.menu li {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px;
		border-radius: var(--clipa-r-sm);
		font-size: 13px;
		color: var(--clipa-text-2);
	}
	.menu li.hl {
		background: var(--clipa-surface-3);
		color: var(--clipa-text);
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
</style>
