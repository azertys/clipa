<script lang="ts">
	import type { TitleTime } from "../../../core/reports";
	import { formatDuration } from "../../../core/time";
	import { strings } from "../strings";
	import CoverageBar from "./CoverageBar.svelte";
	import Icon from "./Icon.svelte";

	// An app with recorded window titles opens to show them, longest first.
	let {
		apps,
		limit = 6,
	}: {
		apps: { name: string; ms: number; titles?: TitleTime[] }[];
		/** Apps after this count fold into "Other (n apps)" */
		limit?: number;
	} = $props();

	let open = $state<Record<string, boolean>>({});

	const rows = $derived.by(() => {
		const sorted = [...apps].sort((a, b) => b.ms - a.ms);
		const total = sorted.reduce((s, a) => s + a.ms, 0);
		if (sorted.length <= limit) return { total, list: sorted, other: null };
		const rest = sorted.slice(limit - 1);
		return {
			total,
			list: sorted.slice(0, limit - 1),
			other: { name: strings.reports.other(rest.length), ms: rest.reduce((s, a) => s + a.ms, 0) },
		};
	});
	const share = (ms: number) => (rows.total > 0 ? ms / rows.total : 0);
	/** Time of the titles a report left out (it keeps the longest ones). */
	const rest = (app: { ms: number; titles?: TitleTime[] }) =>
		app.ms - (app.titles ?? []).reduce((s, t) => s + t.ms, 0);
</script>

{#if apps.length === 0}
	<p class="empty">{strings.reports.noApps}</p>
{:else}
	<ul class="list">
		{#each rows.list as app (app.name)}
			{@const titled = (app.titles?.length ?? 0) > 0}
			<li>
				{#if titled}
					<button
						class="line toggle"
						type="button"
						aria-expanded={open[app.name] ?? false}
						title={strings.reports.showTitles(app.name)}
						onclick={() => (open[app.name] = !open[app.name])}
					>
						<span class="name">
							<span class="chevron" class:down={open[app.name]}><Icon name="chevron-right" size={12} strokeWidth={2} /></span>
							{app.name}
						</span>
						<span class="v clipa-num">{formatDuration(app.ms)}</span>
					</button>
				{:else}
					<div class="line"><span>{app.name}</span><span class="v clipa-num">{formatDuration(app.ms)}</span></div>
				{/if}
				<CoverageBar value={share(app.ms)} tone="accent" />
				{#if titled && open[app.name]}
					<ul class="titles">
						{#each app.titles ?? [] as t (t.title)}
							<li>
								<span class="t" class:none={t.title === null} title={t.title ?? undefined}>
									{t.title ?? strings.reports.noTitle}
								</span>
								<span class="clipa-num">{formatDuration(t.ms)}</span>
							</li>
						{/each}
						{#if rest(app) >= 60_000}
							<li>
								<span class="t none">{strings.reports.otherTitles}</span>
								<span class="clipa-num">{formatDuration(rest(app))}</span>
							</li>
						{/if}
					</ul>
				{/if}
			</li>
		{/each}
		{#if rows.other}
			<li>
				<div class="line">
					<span class="muted">{rows.other.name}</span><span class="v clipa-num">{formatDuration(rows.other.ms)}</span>
				</div>
				<CoverageBar value={share(rows.other.ms)} tone="neutral" />
			</li>
		{/if}
	</ul>
{/if}

<style>
	.empty {
		margin: 0;
		color: var(--clipa-muted);
		font-size: 13px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.list > li {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
	}
	.toggle {
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
	}
	.toggle:hover .name {
		color: var(--clipa-text);
	}
	.name {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: -2px;
	}
	.chevron {
		display: inline-flex;
		color: var(--clipa-faint);
		transition: transform 120ms;
	}
	.chevron.down {
		transform: rotate(90deg);
	}
	.v {
		font-weight: 600;
	}
	.muted {
		color: var(--clipa-muted);
	}
	.titles {
		list-style: none;
		margin: 2px 0 4px;
		padding: 0 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-left: 1px solid var(--clipa-divider);
		font-size: 12px;
		color: var(--clipa-text-2);
	}
	.titles li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding-left: 10px;
	}
	.t {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.t.none {
		color: var(--clipa-faint);
		font-style: italic;
	}
</style>
