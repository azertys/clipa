<script lang="ts">
	import ink from "../../../assets/logo/clipa-lockup.svg";
	import white from "../../../assets/logo/clipa-lockup-white.svg";
	import { app } from "../lib/app.svelte";
	import { strings } from "../strings";

	let { height = 22 }: { height?: number } = $props();
</script>

<img src={app.traits.logo === "ink" ? ink : white} alt={strings.appName} style="height: {height}px" />

<style>
	img {
		display: block;
	}
</style>
