<script lang="ts">
	import type { Tag } from "../../../core/types";
	import type { Settings } from "../../shared/rpc-schema";
	import ConfirmDialog from "../components/ConfirmDialog.svelte";
	import { app, tagColor } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";
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

	$effect(() => {
		void api.appInfo({}).then((info) => (dbPath = info.dbPath));
	});

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
</script>

<div class="narrow">
	<PageHeader title={strings.settings.title} subtitle={strings.settings.subtitle} />

	<Card title={strings.settings.general}>
		<SettingsRow label={strings.settings.menuBarTimer} description={strings.settings.menuBarTimerHint}>
			{#snippet control()}
				<Toggle
					label={strings.settings.menuBarTimer}
					checked={app.settings.showTrayTimer}
					onchange={(v) => set({ showTrayTimer: v })}
				/>
			{/snippet}
		</SettingsRow>
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
				<Button size="sm" onclick={() => api.revealDatabase({})}>{strings.settings.showInFinder}</Button>
			{/snippet}
		</SettingsRow>
	</Card>
</div>

{#if deleting}
	{@const target = deleting}
	<ConfirmDialog
		message={strings.settings.confirmDeleteTag(target.name)}
		onanswer={(yes) => {
			deleting = null;
			if (yes) void remove(target);
		}}
	/>
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
