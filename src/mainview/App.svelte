<script lang="ts">
	import { onMount } from "svelte";
	import { formatElapsed } from "../../core/time";
	import type { Screen } from "../shared/rpc-schema";
	import { app } from "./lib/app.svelte";
	import { api } from "./lib/rpc";
	import RecoveryDialog from "./components/RecoveryDialog.svelte";
	import Calendar from "./screens/Calendar.svelte";
	import Entries from "./screens/Entries.svelte";
	import Placeholder from "./screens/Placeholder.svelte";
	import Settings from "./screens/Settings.svelte";
	import Today from "./screens/Today.svelte";
	import { strings } from "./strings";

	const screens: Screen[] = ["today", "entries", "calendar", "reports", "settings"];

	onMount(async () => {
		await app.load();
		const start = await api.uiReady({});
		if (start.navigation) app.navigate(start.navigation);
		app.recovery = start.recovery;
	});

	function onkeydown(e: KeyboardEvent) {
		if (!e.metaKey || e.altKey || e.ctrlKey) return;
		if (e.key === "Enter") {
			e.preventDefault();
			void app.toggleTimer();
		} else if (e.key === "n") {
			e.preventDefault();
			app.screen = "entries";
			app.panelEntryId = "new";
		} else if (e.key >= "1" && e.key <= "5") {
			e.preventDefault();
			app.screen = screens[Number(e.key) - 1];
		}
	}
</script>

<svelte:window {onkeydown} />

{#if app.recovery}
	<RecoveryDialog notice={app.recovery} onclose={() => (app.recovery = null)} />
{/if}

<div class="shell">
	<nav>
		<div class="brand">{strings.appName}</div>
		{#each screens as screen, i (screen)}
			<button class="nav" class:active={app.screen === screen} onclick={() => (app.screen = screen)}>
				<span>{strings.nav[screen]}</span>
				<kbd>⌘{i + 1}</kbd>
			</button>
		{/each}
		<div class="spacer"></div>
		{#if app.running}
			<button class="mini" onclick={() => (app.screen = "today")}>
				<span class="dot"></span>
				{formatElapsed(app.now - app.running.started_at)}
			</button>
		{/if}
	</nav>

	<main class:flush={app.screen === "entries" || app.screen === "calendar"}>
		{#if app.error}
			<div class="error" role="alert">
				{app.error}
				<button class="ghost" onclick={() => (app.error = null)} aria-label={strings.panel.cancel}>×</button>
			</div>
		{/if}
		{#if app.screen === "today"}
			<Today />
		{:else if app.screen === "entries"}
			<Entries />
		{:else if app.screen === "calendar"}
			<Calendar />
		{:else if app.screen === "reports"}
			<Placeholder text={strings.placeholder.reports} />
		{:else}
			<Settings />
		{/if}
	</main>
</div>

<style>
	.shell {
		display: flex;
		height: 100vh;
	}
	nav {
		width: 190px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 16px 10px;
		background: var(--sidebar);
		border-right: 1px solid var(--border);
	}
	.brand {
		font-weight: 700;
		font-size: 15px;
		padding: 4px 10px 14px;
	}
	.nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 7px 10px;
		border: none;
		border-radius: 6px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.nav:hover {
		background: var(--hover);
	}
	.nav.active {
		background: var(--selected);
		font-weight: 600;
	}
	kbd {
		font: inherit;
		font-size: 11px;
		color: var(--muted);
	}
	.spacer {
		flex: 1;
	}
	.mini {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 20px 24px;
		position: relative;
	}
	main.flush {
		padding: 0;
		overflow: hidden;
	}
	.error {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding: 8px 12px;
		border-radius: 6px;
		background: var(--error-bg);
		color: var(--error);
	}
	main.flush .error {
		position: absolute;
		left: 24px;
		right: 24px;
		top: 12px;
	}
</style>
