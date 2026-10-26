<script lang="ts">
	import { formatClock } from "../../../core/time";
	import type { RecoveryNotice } from "../../shared/rpc-schema";
	import { app, tz } from "../lib/app.svelte";
	import { api } from "../lib/rpc";
	import { strings } from "../strings";

	let { notice, onclose }: { notice: RecoveryNotice; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
	});

	function edit() {
		onclose();
		app.navigate({ screen: "entries", entryId: notice.entry.id });
	}

	async function resume() {
		onclose();
		const entry = await app.attempt(() =>
			api.timerStart({ note: notice.entry.note, tagIds: notice.entry.tagIds }),
		);
		if (entry) app.setRunning(entry);
		app.revision++;
	}
</script>

<dialog bind:this={dialog} oncancel={onclose} aria-labelledby="recovery-title">
	<h2 id="recovery-title">{strings.dialogs.recoveryTitle}</h2>
	<p>{strings.dialogs.recoveryMessage(formatClock(notice.endedAt, tz))}</p>
	<footer>
		<button onclick={onclose}>{strings.dialogs.recoveryKeep}</button>
		<button onclick={edit}>{strings.dialogs.recoveryEdit}</button>
		<button class="primary" onclick={resume}>{strings.dialogs.recoveryResume}</button>
	</footer>
</dialog>
