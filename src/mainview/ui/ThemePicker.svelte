<script lang="ts">
	import type { ThemeName } from "../../shared/rpc-schema";
	import { themeOrder } from "../lib/theme";
	import { strings } from "../strings";

	// A card per theme with a small preview. The arrow keys move between them.
	let { value, onchange }: { value: ThemeName; onchange: (name: ThemeName) => void } = $props();

	let picker: HTMLDivElement;

	function onkeydown(e: KeyboardEvent) {
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
		e.preventDefault();
		const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
		const i = (themeOrder.indexOf(value) + step + themeOrder.length) % themeOrder.length;
		onchange(themeOrder[i]);
		picker.querySelectorAll<HTMLButtonElement>("[role=radio]")[i]?.focus();
	}
</script>

<div class="picker" role="radiogroup" aria-label={strings.settings.theme} tabindex="-1" bind:this={picker} {onkeydown}>
	{#each themeOrder as name (name)}
		{@const on = value === name}
		<button
			class="option"
			class:on
			type="button"
			role="radio"
			aria-checked={on}
			tabindex={on ? 0 : -1}
			onclick={() => onchange(name)}
		>
			<!-- The previews have fixed colors: each shows its own theme -->
			<span class="preview {name}" aria-hidden="true">
				{#if name === "dark"}
					<span class="d-side"><i class="d-logo"></i><i></i><i></i><i></i></span>
					<span class="d-main"><i class="d-card"></i><i class="d-g"></i><i class="d-a"></i></span>
				{:else}
					<span class="r-nav"><i class="r-on"></i><i></i><i></i></span>
					<span class="r-card"><i class="r-lcd"></i><i class="r-key"></i></span>
					<span class="r-bars"><i class="r-m"></i><i class="r-t"></i></span>
				{/if}
			</span>
			<span class="meta">
				<span class="name">{strings.themes[name].label}</span>
				<span class="desc">{on ? strings.settings.themeInUse : strings.themes[name].description}</span>
			</span>
		</button>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 14px;
	}
	.option {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		text-align: left;
		border: var(--clipa-bw) solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-lg);
		background: var(--clipa-field);
		color: var(--clipa-text);
	}
	.option.on {
		border-color: var(--clipa-accent);
		box-shadow: 0 0 0 1px var(--clipa-accent);
	}
	:global(:root[data-theme="retro"]) .option.on {
		border-color: var(--clipa-ink);
		background: var(--clipa-accent);
		box-shadow: var(--clipa-btn-shadow);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.name {
		font-weight: 700;
	}
	.desc {
		font-family: var(--clipa-label-font);
		font-size: 12px;
		opacity: 0.8;
	}

	.preview {
		display: flex;
		height: 92px;
		border: 1.5px solid #1e1b16;
		border-radius: 6px;
		overflow: hidden;
	}
	.preview i {
		display: block;
	}
	.dark {
		background: #181818;
	}
	.d-side {
		width: 28%;
		padding: 8px 6px;
		display: flex;
		flex-direction: column;
		gap: 5px;
		background: #141414;
		border-right: 1px solid #2b2b2b;
	}
	.d-side i {
		height: 5px;
		border-radius: 2px;
		background: #262626;
	}
	.d-side .d-logo {
		width: 70%;
		height: 6px;
		background: #ededed;
	}
	.d-main {
		flex: 1;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.d-card {
		height: 30px;
		border: 1px solid #2b2b2b;
		border-radius: 4px;
		background: #1f1f1f;
	}
	.d-g {
		width: 60%;
		height: 8px;
		border-radius: 2px;
		background: #4fbf87;
	}
	.d-a {
		width: 40%;
		height: 8px;
		border-radius: 2px;
		background: #e0a04b;
	}
	.retro {
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: #beb8a8;
	}
	.r-nav {
		display: flex;
		gap: 4px;
	}
	.r-nav i {
		width: 24px;
		height: 7px;
		border: 1px solid #1e1b16;
		background: #d9d3c3;
	}
	.r-nav .r-on {
		background: #1e1b16;
	}
	.r-card {
		flex: 1;
		display: flex;
		gap: 6px;
		padding: 6px;
		border: 1.5px solid #1e1b16;
		border-radius: 4px;
		background: #d9d3c3;
	}
	.r-lcd {
		flex: 1;
		border-radius: 2px;
		background: #2b2a24;
	}
	.r-key {
		width: 24px;
		height: 24px;
		align-self: center;
		border: 1.5px solid #1e1b16;
		border-radius: 50%;
		background: #d2552c;
	}
	.r-bars {
		display: flex;
		gap: 4px;
	}
	.r-bars i {
		height: 7px;
		border: 1px solid #1e1b16;
	}
	.r-m {
		width: 50%;
		background: #e3a72f;
	}
	.r-t {
		width: 30%;
		background: #276a70;
	}
</style>
