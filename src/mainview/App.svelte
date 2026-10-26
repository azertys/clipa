<script lang="ts">
	import { onMount } from "svelte";
	import { length } from "../../core/overlap";
	import { trackedIntervals } from "../../core/reports";
	import { addLocalDays, startOfLocalDay, startOfLocalWeek } from "../../core/time";
	import type { EntryWithTags } from "../../core/types";
	import type { Screen } from "../shared/rpc-schema";
	import IdleDialog from "./components/IdleDialog.svelte";
	import RecoveryDialog from "./components/RecoveryDialog.svelte";
	import { app, tz } from "./lib/app.svelte";
	import { api, send } from "./lib/rpc";
	import Calendar from "./screens/Calendar.svelte";
	import Entries from "./screens/Entries.svelte";
	import Reports from "./screens/Reports.svelte";
	import Settings from "./screens/Settings.svelte";
	import Today from "./screens/Today.svelte";
	import { strings } from "./strings";
	import AppShell from "./ui/AppShell.svelte";
	import IconButton from "./ui/IconButton.svelte";
	import RunningTimerMini from "./ui/RunningTimerMini.svelte";
	import Sidebar from "./ui/Sidebar.svelte";
	import SidebarSummary from "./ui/SidebarSummary.svelte";

	const screens: Screen[] = ["today", "entries", "calendar", "reports", "settings"];

	// Sidebar totals for today and this week.
	let weekEntries = $state<EntryWithTags[]>([]);
	const dayStart = $derived(startOfLocalDay(app.now, tz));
	const weekStart = $derived(startOfLocalWeek(app.now, tz, app.settings.weekStart));
	const weekEnd = $derived(addLocalDays(weekStart, 7, tz));
	const todayMs = $derived(length(trackedIntervals(weekEntries, dayStart, addLocalDays(dayStart, 1, tz), app.now)));
	const weekMs = $derived(length(trackedIntervals(weekEntries, weekStart, weekEnd, app.now)));

	$effect(() => {
		const [from, to] = [weekStart, weekEnd];
		void [app.revision, app.running?.id];
		void api.entriesList({ from, to }).then((list) => (weekEntries = list));
	});

	onMount(async () => {
		await app.load();
		const start = await api.uiReady({});
		if (start.navigation) app.navigate(start.navigation);
		app.recovery = start.recovery;
		if (start.idle) app.idle = start.idle;
	});

	const windows = navigator.userAgent.includes("Windows");

	function onkeydown(e: KeyboardEvent) {
		// The close button keeps Clipa in the tray; Alt+F4 quits, as ⌘Q does on macOS.
		if (windows && e.altKey && e.key === "F4") {
			e.preventDefault();
			send.appQuit({});
			return;
		}
		if (!e.metaKey || e.altKey || e.ctrlKey || e.defaultPrevented) return;
		if (e.key === "Enter") {
			e.preventDefault();
			void app.toggleTimer();
		} else if (e.key === "n") {
			e.preventDefault();
			app.navigate({ screen: "entries", entryId: "new" });
		} else if (e.key >= "1" && e.key <= "5") {
			e.preventDefault();
			app.screen = screens[Number(e.key) - 1];
		}
	}

	// The webview's own menu has Inspect Element. Text fields get Cut / Copy / Paste from the main process.
	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		const field = (e.target as Element).closest("input, textarea, [contenteditable]");
		if (field) send.editMenuShow({});
	}
</script>

<svelte:window {onkeydown} {oncontextmenu} />

{#if app.recovery}
	<RecoveryDialog notice={app.recovery} onclose={() => (app.recovery = null)} />
{:else if app.idle}
	<IdleDialog prompt={app.idle} onclose={() => (app.idle = null)} />
{/if}

<AppShell flush={app.screen === "calendar"}>
	{#snippet sidebar()}
		<Sidebar active={app.screen} onnavigate={(id) => (app.screen = id)}>
			{#snippet footer()}
				{#if app.running}
					<RunningTimerMini
						elapsedMs={app.now - app.running.started_at}
						note={app.note}
						onclick={() => (app.screen = "today")}
					/>
				{:else}
					<SidebarSummary {todayMs} {weekMs} />
				{/if}
			{/snippet}
		</Sidebar>
	{/snippet}

	{#if app.error}
		<div class="error" role="alert">
			<span>{app.error}</span>
			<IconButton icon="close" label={strings.common.close} size={26} iconSize={12} onclick={() => (app.error = null)} />
		</div>
	{/if}
	{#if app.screen === "today"}
		<Today />
	{:else if app.screen === "entries"}
		<Entries />
	{:else if app.screen === "calendar"}
		<Calendar />
	{:else if app.screen === "reports"}
		<Reports />
	{:else}
		<Settings />
	{/if}
</AppShell>

<style>
	.error {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 6px 6px 6px 14px;
		border: 1px solid var(--clipa-danger);
		border-radius: var(--clipa-r-lg);
		background: var(--clipa-danger-tint);
		color: var(--clipa-danger-text);
		font-size: 13px;
	}
</style>
