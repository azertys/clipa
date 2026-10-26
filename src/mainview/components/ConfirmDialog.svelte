<script lang="ts">
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";

	// A yes/no question before a delete. Esc cancels.
	let {
		message,
		confirmLabel = strings.common.delete,
		onanswer,
	}: { message: string; confirmLabel?: string; onanswer: (yes: boolean) => void } = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (!dialog.open) dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	oncancel={(e) => {
		e.preventDefault();
		onanswer(false);
	}}
	aria-label={message}
>
	<p class="message">{message}</p>
	<footer>
		<Button variant="secondary" onclick={() => onanswer(false)}>{strings.common.cancel}</Button>
		<!-- svelte-ignore a11y_autofocus -->
		<Button variant="stop" onclick={() => onanswer(true)} autofocus>{confirmLabel}</Button>
	</footer>
</dialog>

<style>
	dialog {
		width: 360px;
	}
	.message {
		font-size: 14px;
		color: var(--clipa-text);
	}
</style>
