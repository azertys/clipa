<script lang="ts">
	import type { ImportSummary } from "../../../core/backup";
	import { localDate } from "../../../core/time";
	import type { Tag } from "../../../core/types";
	import { platform } from "../../shared/platform";
	import type { ActivityDays, BackupStatus, Settings, TrackingStatus, UpdateCheck } from "../../shared/rpc-schema";
	import ConfirmDialog from "../components/ConfirmDialog.svelte";
	import ImportDialog from "../components/ImportDialog.svelte";
	import { app, clock, tagColor, tz } from "../lib/app.svelte";
	import { longDay } from "../lib/dates";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
	import AppListInput from "../ui/AppListInput.svelte";
	import Button from "../ui/Button.svelte";
	import Card from "../ui/Card.svelte";
	import IconButton from "../ui/IconButton.svelte";
	import PageHeader from "../ui/PageHeader.svelte";
	import Segmented from "../ui/Segmented.svelte";
	import SettingsRow from "../ui/SettingsRow.svelte";
	import TagInput from "../ui/TagInput.svelte";
	import Toggle from "../ui/Toggle.svelte";

	let renaming = $state<string | null>(null);
	let renameText = $state("");
	let creating = $state(false);
	let newName = $state("");
	let deleting = $state<Tag | null>(null);
	let dbPath = $state("");
	let status = $state<TrackingStatus | null>(null);
	let knownApps = $state<{ key: string; name: string }[]>([]);
	/** The idle threshold to restore when idle detection is turned back on. */
	let lastIdleMinutes = $state(5);
	let version = $state("");
	let backup = $state<BackupStatus | null>(null);
	/** "Saved … in Downloads." under the Data card, for a few seconds. */
	let dataNotice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let importing = $state(false);
	let summary = $state<ImportSummary | null>(null);
	let fileInput: HTMLInputElement;
	let update = $state<UpdateCheck | null>(null);
	let checking = $state(false);
	let installing = $state(false);

	const IDLE_CHOICES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
	const KEEP_CHOICES: ActivityDays[] = [30, 90, 365, 0];
	const keepLabel = (days: ActivityDays) =>
		days === 0 ? strings.settings.forever : days === 365 ? strings.settings.oneYear : strings.settings.days(days);

	$effect(() => {
		void api.appInfo({}).then((info) => {
			dbPath = info.dbPath;
			version = info.version;
		});
		void refreshBackup();
		void api.appsList({}).then((list) => (knownApps = list));
		void refreshStatus();
		// Coming back from System Settings: the permission may have changed.
		window.addEventListener("focus", refreshStatus);
		return () => {
			window.removeEventListener("focus", refreshStatus);
			clearTimeout(noticeTimer);
		};
	});

	$effect(() => {
		if (app.settings.idleMinutes > 0) lastIdleMinutes = app.settings.idleMinutes;
	});

	const backupHint = $derived.by(() => {
		if (!backup) return "";
		const last = backup.lastAt === null ? null : `${longDay(localDate(backup.lastAt, tz))}, ${clock(backup.lastAt)}`;
		return strings.settings.autoBackupHint(backup.folder, last);
	});

	const updateText = $derived.by(() => {
		const current = strings.settings.version(version);
		if (installing) return strings.settings.updateDownloading;
		switch (update?.state) {
			case "current":
				return `${current}. ${strings.settings.updateCurrent}`;
			case "available":
				return strings.settings.updateAvailable(update.latest);
			case "unavailable":
				return `${current}. ${strings.settings.updateUnavailable}`;
			case "error":
				return `${current}. ${strings.settings.updateError}`;
			default:
				return current;
		}
	});

	async function refreshBackup() {
		backup = (await app.attempt(() => api.backupStatus({}))) ?? null;
	}

	async function setAutoBackup(on: boolean) {
		await set({ autoBackup: on });
		await refreshBackup();
	}

	async function chooseFolder() {
		const settings = await app.attempt(() => api.backupChooseFolder({}));
		if (settings) app.settings = settings;
		await refreshBackup();
	}

	function showSaved(path: string) {
		dataNotice = strings.settings.exported(path.split(/[\\/]/).pop() ?? path);
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (dataNotice = null), 5000);
	}

	async function exportJson() {
		const saved = await app.attempt(() => api.backupExport({ tzid: tz }));
		if (saved) showSaved(saved.path);
	}

	async function exportCsv() {
		const saved = await app.attempt(() => api.entriesExportCsv({ tzid: tz, range: null }));
		if (saved) showSaved(saved.path);
	}

	/** The file comes from a file field: WKWebView shows the open panel without blocking the main process. */
	async function importFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		// Clear the field so that the same file can be chosen again.
		e.currentTarget.value = "";
		if (!file) return;
		importing = true;
		const result = await app.attempt(async () => api.backupImport({ json: await file.text() }));
		importing = false;
		if (!result) return;
		summary = result;
		await Promise.all([app.reloadTags(), refreshBackup()]);
	}

	async function checkUpdates() {
		checking = true;
		update = (await app.attempt(() => api.updateCheck({}))) ?? null;
		checking = false;
	}

	async function installUpdate() {
		if (await app.attempt(() => api.updateInstall({}))) installing = true;
	}

	async function refreshStatus() {
		status = (await app.attempt(() => api.trackingStatus({}))) ?? null;
	}

	async function setRecordTitles(on: boolean) {
		await set({ recordTitles: on });
		if (on && platform === "macos" && status && !status.titlePermission) {
			await app.attempt(() => api.trackingRequestPermission({}));
			await refreshStatus();
		}
	}

	async function setLaunchAtLogin(on: boolean) {
		const state = await app.attempt(() => api.launchAtLoginSet({ on }));
		if (state && status) status = { ...status, launchAtLogin: state };
	}

	async function set(patch: Partial<Settings>) {
		const settings = await app.attempt(() => api.settingsSet(patch));
		if (settings) app.settings = settings;
	}

	async function saveTag(input: { id?: string; name: string; color?: string | null }) {
		const saved = await app.attempt(() => api.tagsUpsert(input));
		if (saved) await app.reloadTags();
		return saved;
	}

	async function create() {
		if (newName.trim() === "") return;
		if (await saveTag({ name: newName })) {
			creating = false;
			newName = "";
		}
	}

	async function rename(tag: Tag) {
		if (await saveTag({ id: tag.id, name: renameText })) renaming = null;
	}

	async function remove(tag: Tag) {
		if (await app.attempt(() => api.tagsDelete({ id: tag.id }))) {
			await app.reloadTags();
			app.revision++;
		}
	}

	// Keep the tag before clearing `deleting`: a {@const} would read null after it.
	function answerDelete(yes: boolean) {
		const tag = deleting;
		deleting = null;
		if (yes && tag) void remove(tag);
	}
</script>

<div class="narrow">
	<PageHeader title={strings.settings.title} subtitle={strings.settings.subtitle} />

	<Card title={strings.settings.general}>
		<SettingsRow
			label={strings.settings.launchAtLogin}
			description={status?.launchAtLogin === "approval"
				? strings.settings.launchApproval
				: status?.launchAtLogin === "unavailable"
					? strings.settings.launchUnavailable
					: strings.settings.launchAtLoginHint}
		>
			{#snippet control()}
				<Toggle
					label={strings.settings.launchAtLogin}
					checked={status?.launchAtLogin === "on" || status?.launchAtLogin === "approval"}
					disabled={!status || status.launchAtLogin === "unavailable"}
					onchange={setLaunchAtLogin}
				/>
			{/snippet}
		</SettingsRow>
		<!-- Only the macOS menu bar shows text next to the icon. Windows has the time in the tooltip. -->
		{#if platform === "macos"}
			<SettingsRow label={strings.settings.menuBarTimer} description={strings.settings.menuBarTimerHint}>
				{#snippet control()}
					<Toggle
						label={strings.settings.menuBarTimer}
						checked={app.settings.showTrayTimer}
						onchange={(v) => set({ showTrayTimer: v })}
					/>
				{/snippet}
			</SettingsRow>
		{/if}
		<SettingsRow label={strings.settings.weekStart} for="week-start">
			{#snippet control()}
				<select
					id="week-start"
					value={String(app.settings.weekStart)}
					onchange={(e) => set({ weekStart: e.currentTarget.value === "7" ? 7 : 1 })}
				>
					<option value="1">{strings.settings.monday}</option>
					<option value="7">{strings.settings.sunday}</option>
				</select>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.timeFormat}>
			{#snippet control()}
				<Segmented
					size="sm"
					label={strings.settings.timeFormat}
					value={app.settings.hour12 ? "12" : "24"}
					onchange={(v) => set({ hour12: v === "12" })}
					options={[
						{ value: "24", label: strings.settings.hour24 },
						{ value: "12", label: strings.settings.hour12 },
					]}
				/>
			{/snippet}
		</SettingsRow>
	</Card>

	<Card title={strings.settings.timer}>
		<SettingsRow label={strings.settings.defaultTags} description={strings.settings.defaultTagsHint} for="default-tags" stacked>
			{#snippet control()}
				<div class="full">
					<TagInput
						id="default-tags"
						value={app.settings.defaultTagIds}
						onchange={(ids) => set({ defaultTagIds: ids })}
						height={38}
					/>
				</div>
			{/snippet}
		</SettingsRow>
		<SettingsRow
			label={strings.settings.idle}
			description={status && !status.measuresIdle ? strings.settings.idleUnavailable : strings.settings.idleHint}
		>
			{#snippet control()}
				<label for="idle-minutes" class="clipa-sr-only">{strings.settings.idleAfter}</label>
				<select
					id="idle-minutes"
					value={String(app.settings.idleMinutes || lastIdleMinutes)}
					disabled={app.settings.idleMinutes === 0}
					onchange={(e) => set({ idleMinutes: Number(e.currentTarget.value) })}
				>
					{#each IDLE_CHOICES as m (m)}<option value={String(m)}>{strings.settings.idleMinutes(m)}</option>{/each}
				</select>
				<Toggle
					label={strings.settings.idle}
					checked={app.settings.idleMinutes > 0}
					onchange={(on) => set({ idleMinutes: on ? lastIdleMinutes : 0 })}
				/>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.discardShort} description={strings.settings.discardShortHint}>
			{#snippet control()}
				<Toggle
					label={strings.settings.discardShort}
					checked={app.settings.discardShort}
					onchange={(v) => set({ discardShort: v })}
				/>
			{/snippet}
		</SettingsRow>
	</Card>

	<Card title={strings.settings.appTracking}>
		<p class="help">{strings.settings.appTrackingHint}</p>
		{#if status && !status.nativeLoaded}
			<p class="help">{strings.settings.nativeMissing}</p>
		{:else if status && !status.seesApps}
			<p class="help">{strings.settings.appsHidden}</p>
		{/if}
		<SettingsRow label={strings.settings.recordTitles} description={strings.settings.recordTitlesHint}>
			{#snippet control()}
				<Toggle
					label={strings.settings.recordTitles}
					checked={app.settings.recordTitles}
					onchange={setRecordTitles}
				/>
			{/snippet}
		</SettingsRow>
		{#if app.settings.recordTitles && status}
			<!-- Only macOS asks for a permission to read window titles. -->
			{#if platform === "macos"}
				<SettingsRow
					label={strings.settings.permission}
					description={status.titlePermission ? strings.settings.permissionGranted : strings.settings.permissionMissing}
				>
					{#snippet control()}
						{#if status?.titlePermission}
							<span class="granted">{strings.settings.permissionGranted}</span>
						{:else}
							<Button size="sm" onclick={() => api.trackingOpenSettings({})}>{strings.settings.openSystemSettings}</Button>
						{/if}
					{/snippet}
				</SettingsRow>
			{/if}
			<SettingsRow label={strings.settings.noTitleApps} description={strings.settings.noTitleAppsHint} stacked>
				{#snippet control()}
					<AppListInput
						value={app.settings.noTitleApps}
						apps={knownApps}
						onchange={(keys) => set({ noTitleApps: keys })}
					/>
				{/snippet}
			</SettingsRow>
		{/if}
		<SettingsRow label={strings.settings.excludedApps} description={strings.settings.excludedAppsHint} stacked>
			{#snippet control()}
				<AppListInput
					value={app.settings.excludedApps}
					apps={knownApps}
					onchange={(keys) => set({ excludedApps: keys })}
				/>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.keepActivity} description={strings.settings.keepActivityHint} for="keep-activity">
			{#snippet control()}
				<select
					id="keep-activity"
					value={String(app.settings.activityDays)}
					onchange={(e) => set({ activityDays: Number(e.currentTarget.value) as ActivityDays })}
				>
					{#each KEEP_CHOICES as d (d)}<option value={String(d)}>{keepLabel(d)}</option>{/each}
				</select>
			{/snippet}
		</SettingsRow>
	</Card>

	<Card title={strings.settings.tagsTitle}>
		{#snippet actions()}
			<Button size="sm" icon="plus" onclick={() => (creating = true)}>{strings.settings.newTag}</Button>
		{/snippet}
		<p class="help">{strings.settings.tagsHint}</p>
		{#if creating}
			<form
				class="tagrow"
				onsubmit={(e) => {
					e.preventDefault();
					void create();
				}}
			>
				<span class="color" style="background: var(--clipa-accent)"></span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="name-input"
					bind:value={newName}
					placeholder={strings.settings.newTagName}
					aria-label={strings.settings.newTagName}
					autofocus
					onkeydown={(e) => e.key === "Escape" && (creating = false)}
				/>
				<Button size="sm" variant="secondary" onclick={() => (creating = false)}>{strings.common.cancel}</Button>
				<Button size="sm" variant="primary" type="submit">{strings.common.save}</Button>
			</form>
		{/if}
		{#if app.tags.length === 0 && !creating}
			<p class="help">{strings.settings.noTags}</p>
		{/if}
		{#each app.tags as tag (tag.id)}
			<div class="tagrow">
				<label class="color" style="background: {tagColor(tag)}" title={strings.settings.changeColor(tag.name)}>
					<input
						type="color"
						class="clipa-sr-only"
						value={tag.color ?? "#6b9bf5"}
						aria-label={strings.settings.changeColor(tag.name)}
						onchange={(e) => saveTag({ id: tag.id, name: tag.name, color: e.currentTarget.value })}
					/>
				</label>
				{#if renaming === tag.id}
					<form
						class="rename"
						onsubmit={(e) => {
							e.preventDefault();
							void rename(tag);
						}}
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="name-input"
							bind:value={renameText}
							aria-label={strings.settings.rename(tag.name)}
							autofocus
							onkeydown={(e) => e.key === "Escape" && (renaming = null)}
						/>
						<Button size="sm" variant="secondary" onclick={() => (renaming = null)}>{strings.common.cancel}</Button>
						<Button size="sm" variant="primary" type="submit">{strings.common.save}</Button>
					</form>
				{:else}
					<span class="tname">{tag.name}</span>
					<IconButton
						icon="edit"
						label={strings.settings.rename(tag.name)}
						onclick={() => {
							renaming = tag.id;
							renameText = tag.name;
						}}
					/>
					<IconButton icon="trash" tone="danger" label={strings.settings.delete(tag.name)} onclick={() => (deleting = tag)} />
				{/if}
			</div>
		{/each}
	</Card>

	<Card title={strings.settings.data}>
		<SettingsRow label={strings.settings.database} description={dbPath}>
			{#snippet control()}
				<Button size="sm" onclick={() => api.revealDatabase({})}>{strings.settings.showFile}</Button>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.autoBackup} description={backupHint}>
			{#snippet control()}
				<Button size="sm" onclick={chooseFolder}>{strings.settings.chooseFolder}</Button>
				<Toggle label={strings.settings.autoBackup} checked={app.settings.autoBackup} onchange={setAutoBackup} />
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.exportAll} description={strings.settings.exportAllHint}>
			{#snippet control()}
				<Button size="sm" icon="download" onclick={exportCsv}>CSV</Button>
				<Button size="sm" icon="download" onclick={exportJson}>JSON</Button>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.exportAppData} description={strings.settings.exportAppDataHint}>
			{#snippet control()}
				<Toggle
					label={strings.settings.exportAppData}
					checked={app.settings.exportAppData}
					onchange={(v) => set({ exportAppData: v })}
				/>
			{/snippet}
		</SettingsRow>
		<SettingsRow label={strings.settings.importBackup} description={strings.settings.importBackupHint}>
			{#snippet control()}
				<input
					bind:this={fileInput}
					type="file"
					accept=".json,application/json"
					class="clipa-sr-only"
					tabindex="-1"
					aria-hidden="true"
					onchange={importFile}
				/>
				<Button size="sm" disabled={importing} onclick={() => fileInput.click()}>{strings.settings.importButton}</Button>
			{/snippet}
		</SettingsRow>
		{#if dataNotice}<p class="help notice" role="status">{dataNotice}</p>{/if}
	</Card>

	<Card title={strings.settings.updates}>
		<SettingsRow label={strings.settings.updates} description={updateText}>
			{#snippet control()}
				{#if update?.state === "available"}
					<Button size="sm" variant="primary" disabled={installing} onclick={installUpdate}>
						{strings.settings.installUpdate}
					</Button>
				{:else}
					<Button size="sm" disabled={checking} onclick={checkUpdates}>{strings.settings.checkUpdates}</Button>
				{/if}
			{/snippet}
		</SettingsRow>
	</Card>
</div>

{#if summary}
	<ImportDialog {summary} onclose={() => (summary = null)} />
{/if}

{#if deleting}
	<ConfirmDialog message={strings.settings.confirmDeleteTag(deleting.name)} onanswer={answerDelete} />
{/if}

<style>
	.narrow {
		max-width: 780px;
		width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.full {
		width: 100%;
	}
	.help {
		margin: -4px 0 8px;
		font-size: 12px;
		color: var(--clipa-muted);
	}
	.notice {
		margin: 8px 0 0;
	}
	.tagrow {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		border-top: 1px solid var(--clipa-divider);
	}
	.color {
		position: relative;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		flex: none;
	}
	.tname {
		flex: 1;
	}
	.granted {
		font-size: 13px;
		color: var(--clipa-tracked-text);
	}
	.rename {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.name-input {
		flex: 1;
		height: 32px;
	}
</style>
