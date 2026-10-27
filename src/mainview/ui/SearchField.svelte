<script lang="ts">
	import { primaryKey, shortcut } from "../lib/keys";
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";

	// ⌘F (Ctrl+F) puts the focus here. Esc clears the field.
	let { value = $bindable(""), placeholder = strings.entries.search }: { value?: string; placeholder?: string } = $props();

	let input: HTMLInputElement;

	function onwindowkey(e: KeyboardEvent) {
		if (primaryKey(e) && !e.altKey && e.key.toLowerCase() === "f") {
			e.preventDefault();
			input.focus();
			input.select();
		}
	}
</script>

<svelte:window onkeydown={onwindowkey} />

<label class="search">
	<Icon name="search" size={14} strokeWidth={2} />
	<span class="clipa-sr-only">{placeholder}</span>
	<input
		bind:this={input}
		type="search"
		bind:value
		{placeholder}
		onkeydown={(e) => {
			if (e.key === "Escape") value = "";
		}}
	/>
	<span class="kbd">{shortcut("F")}</span>
</label>

<style>
	.search {
		flex: 1 1 220px;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 12px;
		border: 1px solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-md);
		background: var(--clipa-surface);
		color: var(--clipa-muted);
	}
	.search:focus-within {
		border-color: var(--clipa-accent);
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--clipa-text);
		font-size: 13px;
		outline: none;
	}
	input::-webkit-search-cancel-button {
		display: none;
	}
	.kbd {
		font-size: 11px;
		color: var(--clipa-faint);
		padding: 1px 5px;
		border: 1px solid var(--clipa-border-strong);
		border-radius: 4px;
	}
</style>
