<script lang="ts">
	import type { RecoveryNotice } from "../../shared/rpc-schema";
	import { app, clock } from "../lib/app.svelte";
	import { strings } from "../strings";
	import Button from "../ui/Button.svelte";

	let { notice, onclose }: { notice: RecoveryNotice; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (!dialog.open) dialog.showModal();
	});

	function edit() {
		onclose();
		app.navigate({ screen: "entries", entryId: notice.entry.id });
	}

	function resume() {
		onclose();
		void app.continueWith(notice.entry);
	}
</script>

<dialog bind:this={dialog} oncancel={onclose} aria-labelledby="recovery-title">
	<h2 id="recovery-title">{strings.dialogs.recoveryTitle}</h2>
	<p>{strings.dialogs.recoveryMessage(clock(notice.endedAt))}</p>
	<footer>
		<Button variant="secondary" onclick={onclose}>{strings.dialogs.recoveryKeep}</Button>
		<Button variant="secondary" onclick={edit}>{strings.dialogs.recoveryEdit}</Button>
		<Button variant="primary" onclick={resume}>{strings.dialogs.recoveryResume}</Button>
	</footer>
</dialog>
