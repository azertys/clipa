import { describe, expect, test } from "bun:test";
import { getEntry, listEntries, saveEntry } from "../db/entries";
import { saveTag } from "../db/tags";
import { testDb } from "../test-helpers";
import { TimerService } from "./timer";

const SEC = 1000;
const MIN = 60 * SEC;

function setup() {
	const t = testDb();
	const changes: (string | null)[] = [];
	const timer = new TimerService({ db: t.db, ctx: t.ctx, onChange: (e) => changes.push(e?.id ?? null) });
	return { ...t, timer, changes };
}

const timerState = (db: ReturnType<typeof testDb>["db"]) =>
	db.query("SELECT entry_id, heartbeat_at FROM timer_state WHERE id = 1").get() as {
		entry_id: string | null;
		heartbeat_at: number | null;
	};

describe("start and stop", () => {
	test("start opens an entry with tags and sets timer_state", () => {
		const { db, ctx, timer, changes } = setup();
		const tag = saveTag(db, ctx, { name: "Work" });
		const entry = timer.start({ note: "Write", tagIds: [tag.id] });
		expect(entry.ended_at).toBeNull();
		expect(entry.started_at).toBe(ctx.now());
		expect(entry.tagIds).toEqual([tag.id]);
		expect(timer.status()?.id).toBe(entry.id);
		expect(timerState(db)).toEqual({ entry_id: entry.id, heartbeat_at: ctx.now() });
		expect(changes).toEqual([entry.id]);
		timer.dispose();
	});

	test("a second start while a timer runs is refused", () => {
		const { timer } = setup();
		timer.start({ note: "", tagIds: [] });
		expect(() => timer.start({ note: "", tagIds: [] })).toThrow("TIMER_RUNNING");
		timer.dispose();
	});

	test("stop closes the entry at now and clears timer_state", () => {
		const { db, timer, advance, ctx, changes } = setup();
		const entry = timer.start({ note: "", tagIds: [] });
		advance(25 * MIN);
		const closed = timer.stop()!;
		expect(closed.id).toBe(entry.id);
		expect(closed.ended_at).toBe(ctx.now());
		expect(timer.status()).toBeNull();
		expect(timerState(db)).toEqual({ entry_id: null, heartbeat_at: null });
		expect(changes).toEqual([entry.id, null]);
	});

	test("an entry shorter than 1 second is deleted", () => {
		const { db, timer, advance } = setup();
		const entry = timer.start({ note: "", tagIds: [] });
		advance(400);
		expect(timer.stop()).toBeNull();
		expect(getEntry(db, entry.id)!.deleted_at).not.toBeNull();
		expect(listEntries(db, 0, Number.MAX_SAFE_INTEGER)).toEqual([]);
		// A new timer can start.
		timer.start({ note: "", tagIds: [] });
		timer.dispose();
	});

	test("stop with nothing running does nothing", () => {
		const { timer } = setup();
		expect(timer.stop()).toBeNull();
	});

	test("toggle gives the same result as start then stop (window and tray use toggle)", () => {
		const { timer, advance } = setup();
		const started = timer.toggle({ note: "From tray", tagIds: [] })!;
		expect(started.note).toBe("From tray");
		advance(MIN);
		expect(timer.toggle({ note: "ignored", tagIds: [] })).toBeNull();
		expect(timer.status()).toBeNull();
	});

	test("continueWith stops the running entry and starts a new one", () => {
		const { db, timer, advance } = setup();
		const first = timer.start({ note: "A", tagIds: [] });
		advance(MIN);
		const second = timer.continueWith({ note: "B", tagIds: [] });
		expect(getEntry(db, first.id)!.ended_at).not.toBeNull();
		expect(second.note).toBe("B");
		expect(timer.status()?.id).toBe(second.id);
		timer.dispose();
	});

	test("deleting the running entry stops the timer", () => {
		const { db, timer, changes } = setup();
		const entry = timer.start({ note: "", tagIds: [] });
		timer.deleteEntry(entry.id);
		expect(timer.status()).toBeNull();
		expect(timerState(db).entry_id).toBeNull();
		expect(changes).toEqual([entry.id, null]);
	});

	test("the running entry's note and tags can change while it runs", () => {
		const { db, ctx, timer } = setup();
		const tag = saveTag(db, ctx, { name: "T" });
		const entry = timer.start({ note: "", tagIds: [] });
		const updated = saveEntry(db, ctx, { ...entry, note: "New note", tagIds: [tag.id] });
		expect(updated.ended_at).toBeNull();
		expect(updated.note).toBe("New note");
		expect(() => saveEntry(db, ctx, { ...entry, ended_at: ctx.now() + 1 })).toThrow("ENTRY_IS_RUNNING");
		timer.dispose();
	});
});

describe("heartbeat and crash recovery", () => {
	test("heartbeat writes timer_state.heartbeat_at", async () => {
		const t = testDb();
		const timer = new TimerService({ db: t.db, ctx: t.ctx, heartbeatMs: 10 });
		timer.start({ note: "", tagIds: [] });
		t.advance(30 * SEC);
		await Bun.sleep(30);
		expect(timerState(t.db).heartbeat_at).toBe(t.ctx.now());
		timer.dispose();
	});

	test("after a crash the entry ends at the last heartbeat", () => {
		const t = testDb();
		const before = new TimerService({ db: t.db, ctx: t.ctx });
		const entry = before.start({ note: "Deep work", tagIds: [] });
		t.advance(90 * SEC);
		before.beat();
		const lastBeat = t.ctx.now();
		before.dispose(); // the process dies; nothing else runs
		t.advance(10 * MIN);

		const after = new TimerService({ db: t.db, ctx: t.ctx });
		const result = after.recover();
		expect(result.kind).toBe("recovered");
		if (result.kind !== "recovered") throw new Error();
		expect(result.endedAt).toBe(lastBeat);
		expect(result.entry.id).toBe(entry.id);
		expect(getEntry(t.db, entry.id)!.ended_at).toBe(lastBeat);
		expect(after.status()).toBeNull();
		expect(timerState(t.db).entry_id).toBeNull();
	});

	test("a crash before the first heartbeat still gives a valid entry", () => {
		const t = testDb();
		const before = new TimerService({ db: t.db, ctx: t.ctx });
		const entry = before.start({ note: "", tagIds: [] });
		before.dispose();
		t.advance(5 * MIN);
		const result = new TimerService({ db: t.db, ctx: t.ctx }).recover();
		if (result.kind !== "recovered") throw new Error(result.kind);
		// heartbeat_at = started_at at start, so the end is started_at + 1 s.
		expect(result.endedAt).toBe(entry.started_at + SEC);
	});

	test("an entry kept running on quit continues", () => {
		const t = testDb();
		const before = new TimerService({ db: t.db, ctx: t.ctx });
		const entry = before.start({ note: "", tagIds: [] });
		before.markKeptOnQuit();
		before.dispose();
		t.advance(2 * 60 * MIN);
		const after = new TimerService({ db: t.db, ctx: t.ctx });
		const result = after.recover();
		expect(result.kind).toBe("continued");
		expect(after.status()?.id).toBe(entry.id);
		expect(timerState(t.db)).toEqual({ entry_id: entry.id, heartbeat_at: t.ctx.now() });
		after.dispose();
		// The flag is used once: a later crash goes through normal recovery.
		const third = new TimerService({ db: t.db, ctx: t.ctx });
		expect(third.recover().kind).toBe("recovered");
	});

	test("recover with nothing running", () => {
		const t = testDb();
		expect(new TimerService({ db: t.db, ctx: t.ctx }).recover()).toEqual({ kind: "none" });
	});
});

describe("discard and short entries", () => {
	test("discard deletes the running entry and stops the timer", () => {
		const { db, ctx, timer, advance, changes } = setup();
		const entry = timer.start({ note: "Oops", tagIds: [] });
		advance(5 * MIN);
		timer.discard();
		expect(timer.status()).toBeNull();
		expect(getEntry(db, entry.id)).toMatchObject({ deleted_at: ctx.now(), ended_at: ctx.now() });
		expect(timerState(db)).toEqual({ entry_id: null, heartbeat_at: null });
		expect(changes).toEqual([entry.id, null]);
	});

	test("with a minimum of 1 minute, a 40-second timer is not saved", () => {
		const t = testDb();
		let min = 60 * SEC;
		const timer = new TimerService({ db: t.db, ctx: t.ctx, minEntryMs: () => min });
		const short = timer.start({ note: "", tagIds: [] });
		t.advance(40 * SEC);
		expect(timer.stop()).toBeNull();
		expect(getEntry(t.db, short.id)!.deleted_at).toBe(t.ctx.now());
		min = 0;
		timer.start({ note: "", tagIds: [] });
		t.advance(40 * SEC);
		expect(timer.stop()?.ended_at).toBe(t.ctx.now());
	});
});
