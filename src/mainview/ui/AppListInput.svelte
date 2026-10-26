<script lang="ts">
	import { strings } from "../strings";
	import Icon from "./Icon.svelte";

	// A list of apps (bundle ids) chosen from the apps Clipa has recorded.
	let {
		value,
		apps,
		onchange,
		id,
	}: {
		/** Selected bundle ids */
		value: string[];
		/** Apps the sampler has seen */
		apps: { key: string; name: string }[];
		onchange: (keys: string[]) => void;
		id?: string;
	} = $props();

	const names = $derived(new Map(apps.map((a) => [a.key, a.name])));
	const choices = $derived(apps.filter((a) => !value.includes(a.key)));
</script>

<div class="list">
	{#each value as key (key)}
		<span class="chip">
			{names.get(key) ?? key}
			<button
				type="button"
				aria-label={strings.settings.removeApp(names.get(key) ?? key)}
				onclick={() => onchange(value.filter((k) => k !== key))}
			>
				<Icon name="close" size={10} strokeWidth={2.5} />
			</button>
		</span>
	{/each}
	{#if apps.length === 0}
		<span class="hint">{strings.settings.noAppsYet}</span>
	{:else if choices.length > 0}
		<select
			{id}
			value=""
			aria-label={strings.settings.addApp}
			onchange={(e) => {
				const key = e.currentTarget.value;
				e.currentTarget.value = "";
				if (key) onchange([...value, key]);
			}}
		>
			<option value="">{strings.settings.addApp}</option>
			{#each choices as app (app.key)}<option value={app.key}>{app.name}</option>{/each}
		</select>
	{/if}
</div>

<style>
	.list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 26px;
		padding: 0 4px 0 10px;
		border-radius: var(--clipa-r-sm);
		background: var(--clipa-surface-2);
		font-size: 13px;
	}
	.chip button {
		width: 20px;
		height: 20px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--clipa-r-xs);
		background: transparent;
		color: var(--clipa-muted);
	}
	.chip button:hover {
		background: var(--clipa-chip-hover);
		color: var(--clipa-text);
	}
	select {
		height: 30px;
	}
	.hint {
		font-size: 12px;
		color: var(--clipa-faint);
	}
</style>
