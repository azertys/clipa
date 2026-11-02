<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		nav,
		top = false,
		children,
		maxWidth = 1120,
		flush = false,
	}: {
		/** The sidebar, or the top bar when `top` is set */
		nav: Snippet;
		/** The navigation is a bar above the page (retro) */
		top?: boolean;
		children: Snippet;
		/** Content column width in px */
		maxWidth?: number;
		/** No max width, less padding and no page scroll (Calendar) */
		flush?: boolean;
	} = $props();
</script>

<div class="shell" class:top>
	{#if !top}<div class="side">{@render nav()}</div>{/if}
	<main class="main" class:flush>
		<div class="inner" style="max-width: {flush ? 'none' : `${maxWidth}px`}">
			{#if top}{@render nav()}{/if}
			{@render children()}
		</div>
	</main>
</div>

<style>
	.shell {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background-color: var(--clipa-bg);
		background-image: var(--clipa-bg-pattern);
		background-size: 22px 22px;
	}
	.side {
		flex: 0 0 232px;
		width: 232px;
		min-width: 0;
		height: 100%;
	}
	.main {
		flex: 1;
		min-width: 0;
		/* Contains the absolutely placed .clipa-sr-only elements. Without it, one low on a long
		   screen (Reports, Settings) makes the page taller than the window: a second scrollbar. */
		position: relative;
		overflow-y: auto;
		padding: 28px 40px 48px;
	}
	.main.flush {
		padding: 24px 32px 24px;
		overflow: hidden;
	}
	/* The top bar is the first item of the page, with its own padding above */
	.top .main {
		padding: 0 32px 56px;
	}
	.top .main.flush {
		padding: 0 32px 24px;
	}
	.inner {
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.top .inner {
		gap: 26px;
	}
	.flush .inner {
		gap: 16px;
		height: 100%;
	}
	@media (max-width: 960px) {
		.side {
			flex-basis: 200px;
			width: 200px;
		}
		.main {
			padding: 20px 24px 32px;
		}
		.top .main {
			padding: 0 24px 32px;
		}
	}
</style>
