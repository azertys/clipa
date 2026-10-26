<script lang="ts">
	import { NO_REPEAT, sortDays, WEEKDAYS, weekdayOf, type Repeat, type RepeatFreq, type Weekday } from "../../../core/repeat";
	import { localDate, toZoned } from "../../../core/time";
	import { strings } from "../strings";

	/** start: the event start (UTC ms), for the default weekday and the day of the month. */
	let { repeat = $bindable(), start, zone }: { repeat: Repeat; start: number | null; zone: string } = $props();

	const freqs: RepeatFreq[] = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];
	const hasInterval = $derived(["daily", "weekly", "monthly", "yearly"].includes(repeat.freq));
	const monthDay = $derived(start === null ? null : toZoned(start, zone).day);

	function setFreq(freq: RepeatFreq) {
		if (freq === "none") {
			repeat = { ...NO_REPEAT };
			return;
		}
		const days: Weekday[] = freq === "weekly" && start !== null ? [weekdayOf(start, zone)] : [];
		repeat = { ...repeat, freq, days, raw: undefined };
	}

	function toggleDay(day: Weekday) {
		const days = repeat.days.includes(day) ? repeat.days.filter((d) => d !== day) : [...repeat.days, day];
		// At least one day: the last one cannot be turned off.
		if (days.length > 0) repeat = { ...repeat, days: sortDays(days) };
	}

	function setEnd(kind: string) {
		if (kind === "never") repeat = { ...repeat, end: { kind: "never" } };
		if (kind === "count") repeat = { ...repeat, end: { kind: "count", count: 10 } };
		if (kind === "until") {
			const date = start === null ? "" : localDate(toZoned(start, zone).add({ months: 1 }).epochMilliseconds, zone);
			repeat = { ...repeat, end: { kind: "until", date } };
		}
	}
</script>

<div class="repeat">
	<select
		aria-label={strings.event.repeat}
		value={repeat.freq}
		onchange={(e) => setFreq(e.currentTarget.value as RepeatFreq)}
	>
		{#each freqs as f (f)}
			<option value={f}>{strings.event.freq[f]}</option>
		{/each}
		{#if repeat.freq === "custom"}<option value="custom">{strings.event.freq.custom}</option>{/if}
	</select>

	{#if hasInterval}
		<div class="line">
			<span>{strings.event.every}</span>
			<input
				type="number"
				min="1"
				max="99"
				value={repeat.interval}
				oninput={(e) => (repeat = { ...repeat, interval: Math.max(1, Number(e.currentTarget.value) || 1) })}
				aria-label={strings.event.every}
			/>
			<span>{strings.event.unit[repeat.freq][repeat.interval === 1 ? 0 : 1]}</span>
		</div>
	{/if}

	{#if repeat.freq === "weekly"}
		<div class="line days" role="group" aria-label={strings.event.days}>
			{#each WEEKDAYS as day (day)}
				<button type="button" class:on={repeat.days.includes(day)} aria-pressed={repeat.days.includes(day)} onclick={() => toggleDay(day)}>
					{strings.event.weekday[day]}
				</button>
			{/each}
		</div>
	{/if}

	{#if repeat.freq === "monthly" && monthDay !== null}
		<p class="hint">
			{strings.event.monthlyOn(monthDay)}
			{#if monthDay > 28}{strings.event.monthlySkip}{/if}
		</p>
	{/if}

	{#if repeat.freq === "custom"}<p class="hint">{strings.event.customRule(repeat.raw ?? "")}</p>{/if}

	{#if repeat.freq !== "none"}
		<div class="line">
			<span>{strings.event.ends}</span>
			<select value={repeat.end.kind} onchange={(e) => setEnd(e.currentTarget.value)} aria-label={strings.event.ends}>
				<option value="never">{strings.event.endNever}</option>
				<option value="until">{strings.event.endOn}</option>
				<option value="count">{strings.event.endAfter}</option>
			</select>
			{#if repeat.end.kind === "until"}
				<input
					type="date"
					value={repeat.end.date}
					onchange={(e) => (repeat = { ...repeat, end: { kind: "until", date: e.currentTarget.value } })}
					aria-label={strings.event.endOn}
					required
				/>
			{:else if repeat.end.kind === "count"}
				<input
					type="number"
					min="1"
					max="999"
					value={repeat.end.count}
					oninput={(e) => (repeat = { ...repeat, end: { kind: "count", count: Math.max(1, Number(e.currentTarget.value) || 1) } })}
					aria-label={strings.event.occurrences}
				/>
				<span>{strings.event.occurrences}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.repeat {
		display: grid;
		gap: 8px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	input[type="number"] {
		width: 64px;
	}
	.days button {
		height: 28px;
		padding: 0 9px;
		border: 1px solid var(--clipa-border-strong);
		border-radius: var(--clipa-r-sm);
		background: var(--clipa-field);
		color: var(--clipa-text-2);
		font-size: 12px;
	}
	.days button.on {
		background: var(--clipa-accent);
		border-color: var(--clipa-accent);
		color: var(--clipa-on-accent);
		font-weight: 600;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--clipa-muted);
	}
</style>
