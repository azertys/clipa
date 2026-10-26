<script lang="ts">
	import { onMount } from "svelte";

	// A small popup menu under a button, for row actions. Esc or a click outside closes it.
	let {
		anchor,
		items,
		onclose,
	}: {
		anchor: HTMLElement;
		items: { label: string; danger?: boolean; onselect: () => void }[];
		onclose: () => void;
	} = $props();

	let menu: HTMLUListElement;
	const rect = $derived(anchor.getBoundingClientRect());

	onMount(() => {
		menu.querySelector("button")?.focus();
		const outside = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) onclose();
		};
		window.addEventListener("mousedown", outside);
		return () => window.removeEventListener("mousedown", outside);
	});

	function onkeydown(e: KeyboardEvent) {
		const buttons = [...menu.querySelectorAll("button")];
		const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === "Escape") {
			e.stopPropagation();
			onclose();
			anchor.focus();
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next = (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
			buttons[next].focus();
		}
	}
</script>

<ul
	class="menu"
	role="menu"
	bind:this={menu}
	style="top: {rect.bottom + 4}px; right: {window.innerWidth - rect.right}px"
	{onkeydown}
>
	{#each items as item (item.label)}
		<li role="none">
			<button
				type="button"
				role="menuitem"
				class:danger={item.danger}
				onclick={() => {
					onclose();
					item.onselect();
				}}
			>
				{item.label}
			</button>
		</li>
	{/each}
</ul>

<style>
	.menu {
		position: fixed;
		z-index: 40;
		min-width: 160px;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--clipa-menu);
		border: 1px solid var(--clipa-border-raised);
		border-radius: var(--clipa-r-lg);
		box-shadow: var(--clipa-shadow);
	}
	button {
		width: 100%;
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--clipa-r-sm);
		background: transparent;
		color: var(--clipa-text-2);
		font-size: 13px;
		text-align: left;
	}
	button:hover,
	button:focus-visible {
		background: var(--clipa-surface-3);
		color: var(--clipa-text);
		outline: none;
	}
	.danger {
		color: var(--clipa-danger-text);
	}
</style>
