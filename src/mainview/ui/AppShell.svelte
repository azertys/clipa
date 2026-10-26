<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		sidebar,
		children,
		maxWidth = 1120,
		flush = false,
	}: {
		sidebar: Snippet;
		children: Snippet;
		/** Content column width in px */
		maxWidth?: number;
		/** No max width, less padding and no page scroll (Calendar) */
		flush?: boolean;
	} = $props();
</script>

<div class="shell">
	<div class="side">{@render sidebar()}</div>
	<main class="main" class:flush>
		<div class="inner" style="max-width: {flush ? 'none' : `${maxWidth}px`}">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.shell {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: var(--clipa-bg);
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
	.inner {
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	}
</style>
