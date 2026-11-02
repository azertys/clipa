<script lang="ts" module>
	import type { Screen } from "../../shared/rpc-schema";
	import { shortcut } from "../lib/keys";
	import type { IconName } from "./icons";

	type NavItem = { id: Screen; shortcut: string; icon: IconName };

	/** The screens, for the sidebar and the top bar */
	export const navItems: NavItem[] = [
		{ id: "today", shortcut: shortcut("1"), icon: "today" },
		{ id: "entries", shortcut: shortcut("2"), icon: "entries" },
		{ id: "calendar", shortcut: shortcut("3"), icon: "calendar" },
		{ id: "reports", shortcut: shortcut("4"), icon: "reports" },
		{ id: "settings", shortcut: shortcut("5"), icon: "settings" },
	];
</script>

<script lang="ts">
	import type { Snippet } from "svelte";
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";
	import Logo from "./Logo.svelte";

	let {
		active,
		onnavigate,
		footer,
	}: {
		active: Screen;
		onnavigate: (id: Screen) => void;
		/** Bottom block: SidebarSummary or RunningTimerMini */
		footer?: Snippet;
	} = $props();
</script>

<nav class="sidebar" aria-label={strings.nav.label}>
	<div class="brand">
		<Logo />
	</div>

	<ul class="items">
		{#each navItems as item (item.id)}
			<li>
				<button
					class="item"
					class:active={item.id === active}
					aria-current={item.id === active ? "page" : undefined}
					onclick={() => onnavigate(item.id)}
				>
					<Icon name={item.icon} />
					<span class="label">{strings.nav[item.id]}</span>
					<span class="shortcut">{item.shortcut}</span>
				</button>
			</li>
		{/each}
	</ul>

	{#if footer}
		<div class="footer">{@render footer()}</div>
	{/if}
</nav>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 20px 12px;
		background: var(--clipa-sidebar);
		border-right: 1px solid var(--clipa-sidebar-border);
		height: 100%;
	}
	.brand {
		display: flex;
		align-items: center;
		height: 34px;
		padding: 4px 10px;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 36px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--clipa-r);
		background: transparent;
		color: var(--clipa-text-2);
		font-size: 14px;
		text-align: left;
	}
	.item:hover {
		background: var(--clipa-surface);
		color: var(--clipa-text);
	}
	.item.active {
		background: var(--clipa-surface-2);
		color: var(--clipa-text);
		font-weight: 600;
	}
	.label {
		flex: 1;
	}
	.shortcut {
		font-size: 12px;
		color: var(--clipa-faint);
		font-weight: 400;
	}
	.footer {
		margin-top: auto;
	}
</style>
