<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Screen } from "../../shared/rpc-schema";
	import { strings } from "../strings";
	import Logo from "./Logo.svelte";
	import { navItems } from "./Sidebar.svelte";

	// The navigation of themes without a sidebar (retro): the logo, a pill per screen, and a status.
	let {
		active,
		onnavigate,
		status,
	}: {
		active: Screen;
		onnavigate: (id: Screen) => void;
		/** Right side: the compact summary or running timer */
		status?: Snippet;
	} = $props();
</script>

<header class="topbar">
	<button class="home" type="button" aria-label={strings.nav.home} onclick={() => onnavigate("today")}>
		<Logo height={30} />
	</button>
	<nav aria-label={strings.nav.label}>
		<ul>
			{#each navItems as item (item.id)}
				<li>
					<button
						class="pill"
						class:active={item.id === active}
						type="button"
						aria-current={item.id === active ? "page" : undefined}
						title={item.shortcut}
						onclick={() => onnavigate(item.id)}
					>
						{strings.nav[item.id]}
					</button>
				</li>
			{/each}
		</ul>
	</nav>
	{#if status}<div class="status">{@render status()}</div>{/if}
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		padding: 24px 0 4px;
	}
	.home {
		padding: 0;
		border: 0;
		background: transparent;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 14px;
		border: var(--clipa-bw) solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-pill);
		background: var(--clipa-surface);
		color: var(--clipa-text);
		font-family: var(--clipa-nav-font);
		font-size: 13px;
		text-transform: var(--clipa-nav-transform);
	}
	.pill:hover:not(.active) {
		background: var(--clipa-surface-2);
	}
	.pill.active {
		background: var(--clipa-seg-active-bg);
		color: var(--clipa-seg-active-fg);
	}
	.status {
		margin-left: auto;
	}
</style>
