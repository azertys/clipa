import { describe, expect, test } from "bun:test";
import type { IdlePrompt } from "../../shared/rpc-schema";
import { getEntry, listEntries } from "../db/entries";
import { readSettings, writeSettings } from "../db/settings";
import { saveTag } from "../db/tags";
import type { NativeTracker } from "../native/tracker";
import { testDb } from "../test-helpers";
import { EXCLUDED_KEY } from "./sampler";
import { TimerService } from "./timer";
import { Tracking } from "./tracking";

const SEC = 1000;
const MIN = 60 * SEC;

/** A tracker the test controls. */
function fakeTracker() {
	const state = {
		app: { key: "com.microsoft.VSCode", name: "Code" } as { key: string; name: string } | null,
		title: "main.ts" as string | null,
		idleSeconds: 0,
		permission: true,
		titleThrows: false,
	};
	const tracker: NativeTracker = {
		frontmostApp: () => state.app,
		focusedWindowTitle: () => {
			if (state.titleThrows) throw new Error("AX error");
			return state.permission ? state.title : null;
		},
		idleSeconds: () => state.idleSeconds,
		hasTitlePermission: () => state.permission,
		requestTitlePermission: () => {},
	};
	return { state, tracker };
}

function setup() {
	const t = testDb();
	const { state, tracker } = fakeTracker();
	const prompts: IdlePrompt[] = [];
	let tracking: Tracking;
	const timer = new TimerService({ db: t.db, ctx: t.ctx, heartbeatMs: 3_600_000, onChange: (e) => tracking.sync(e) });
	tracking = new Tracking({
		db: t.db,
		ctx: t.ctx,
		tracker,
		timer,
		settings: () => readSettings(t.db),
		excludedName: "Excluded",
		onPrompt: (p) => prompts.push(p),
		intervals: { sampleMs: 0, flushMs: 0, pollMs: 0 },
	});
	/** Advances the clock one second at a time and samples each second. */
	const run = (seconds: number) => {
		for (let i = 0; i < seconds; i++) {
			t.advance(SEC);
			tracking.sampler.tick();
		}
	};
	const activity = () =>
		t.db
			.query(
				`SELECT a.*, p.platform_key, p.display_name FROM activity a JOIN apps p ON p.id = a.app_id ORDER BY a.started_at`,
			)
			.all() as {
			id: string;
			entry_id: string;
			window_title: string | null;
			started_at: number;
			ended_at: number;
			platform_key: string;
			display_name: string;
		}[];
	return { ...t, state, tracker, timer, tracking, prompts, run, activity };
}

describe("sampler (M4 acceptance)", () => {
	test("no activity row is written while the timer is stopped", () => {
		const s = setup();
		s.run(5);
		s.tracking.sampler.tick();
		expect(s.activity()).toEqual([]);
		s.timer.start({ note: "", tagIds: [] });
		s.run(10);
		s.timer.stop();
		const rows = s.activity().length;
		expect(rows).toBe(1);
		s.run(30);
		s.tracking.sampler.flush();
		expect(s.activity()).toHaveLength(rows);
		s.timer.dispose();
	});

	test("with titles off, window_title is always NULL", () => {
		const s = setup();
		expect(readSettings(s.db).recordTitles).toBe(false);
		s.timer.start({ note: "", tagIds: [] });
		s.run(5);
		s.state.app = { key: "com.apple.Safari", name: "Safari" };
		s.run(5);
		s.timer.stop();
		expect(s.activity().map((a) => [a.display_name, a.window_title])).toEqual([
			["Code", null],
			["Safari", null],
		]);
	});

	test("without Accessibility permission, apps are recorded and nothing crashes", () => {
		const s = setup();
		writeSettings(s.db, { recordTitles: true });
		s.state.permission = false;
		s.timer.start({ note: "", tagIds: [] });
		s.run(5);
		s.state.titleThrows = true;
		s.state.app = { key: "com.apple.Safari", name: "Safari" };
		s.run(5);
		s.timer.stop();
		expect(s.activity().map((a) => [a.display_name, a.window_title])).toEqual([
			["Code", null],
			["Safari", null],
		]);
	});

	test("titles on: titles are recorded except for listed apps; excluded apps record as Excluded", () => {
		const s = setup();
		writeSettings(s.db, {
			recordTitles: true,
			noTitleApps: ["com.agilebits.onepassword7"],
			excludedApps: ["com.apple.Safari"],
		});
		s.timer.start({ note: "", tagIds: [] });
		s.run(5);
		s.state.app = { key: "com.agilebits.onepassword7", name: "1Password" };
		s.state.title = "Bank login";
		s.run(5);
		s.state.app = { key: "com.apple.Safari", name: "Safari" };
		s.state.title = "Private tab";
		s.run(5);
		s.timer.stop();
		expect(s.activity().map((a) => [a.platform_key, a.display_name, a.window_title])).toEqual([
			["com.microsoft.VSCode", "Code", "main.ts"],
			["com.agilebits.onepassword7", "1Password", null],
			[EXCLUDED_KEY, "Excluded", null],
		]);
	});

	test("the open segment is flushed and shows in the live totals", () => {
		const s = setup();
		const entry = s.timer.start({ note: "", tagIds: [] });
		s.run(30);
		s.tracking.sampler.flush();
		expect(s.activity()).toEqual([expect.objectContaining({ entry_id: entry.id, ended_at: s.ctx.now() })]);
		s.run(10);
		expect(s.tracking.sampler.liveAppTimes()).toEqual([{ name: "Code", ms: 40 * SEC }]);
		s.timer.stop();
	});

	test("turning app recording off stops writing; entries list the app count", () => {
		const s = setup();
		const entry = s.timer.start({ note: "", tagIds: [] });
		s.run(5);
		s.state.app = { key: "com.apple.Safari", name: "Safari" };
		s.run(5);
		writeSettings(s.db, { trackApps: false });
		s.run(10);
		s.timer.stop();
		expect(s.activity()).toHaveLength(2);
		expect(listEntries(s.db, 0, s.ctx.now() + 1).find((e) => e.id === entry.id)?.appCount).toBe(2);
	});
});

describe("idle (M4 acceptance)", () => {
	test("idle past the threshold is recorded; when input starts again the user is asked", () => {
		const s = setup();
		const entry = s.timer.start({ note: "", tagIds: [] });
		s.advance(10 * MIN);
		s.state.idleSeconds = 4 * 60;
		s.tracking.idle.poll();
		expect(s.db.query("SELECT count(*) AS n FROM idle_periods").get()).toEqual({ n: 0 });
		s.state.idleSeconds = 6 * 60;
		s.tracking.idle.poll();
		const idleStart = s.ctx.now() - 6 * MIN;
		s.advance(20 * MIN);
		s.state.idleSeconds = 2;
		s.tracking.idle.poll();
		expect(s.prompts).toEqual([{ id: expect.any(String), entryId: entry.id, start: idleStart, end: s.ctx.now() - 2 * SEC }]);
		s.timer.stop();
	});

	test("with idle detection off nothing is recorded, but a sleep gap still asks", () => {
		const s = setup();
		writeSettings(s.db, { idleMinutes: 0 });
		s.timer.start({ note: "", tagIds: [] });
		s.state.idleSeconds = 30 * 60;
		s.tracking.idle.poll();
		expect(s.prompts).toEqual([]);
		s.run(5);
		const before = s.ctx.now();
		s.advance(2 * 60 * MIN); // the Mac slept for two hours
		s.tracking.sampler.tick();
		expect(s.prompts).toEqual([expect.objectContaining({ start: before, end: s.ctx.now() })]);
		// The segment closed at the last sample before the sleep.
		expect(s.activity()[0].ended_at).toBe(before);
		s.timer.stop();
	});

	test("discard in the middle of an entry gives two entries with the same note and tags, in one step", () => {
		const s = setup();
		const tag = saveTag(s.db, s.ctx, { name: "Work" });
		const entry = s.timer.start({ note: "Spec review", tagIds: [tag.id] });
		s.run(60); // Code
		s.state.app = { key: "com.apple.Safari", name: "Safari" };
		s.run(60); // Safari, then idle
		const idleStart = s.ctx.now();
		s.state.idleSeconds = 10 * 60;
		s.advance(10 * MIN);
		s.run(1); // no samples for 10 minutes: the sampler reports a gap
		const prompt = s.prompts[0];
		expect(prompt.start).toBe(idleStart);

		s.tracking.resolve(prompt.id, "discard");
		const first = getEntry(s.db, entry.id)!;
		const running = s.timer.status()!;
		expect(first.ended_at).toBe(idleStart);
		expect(running.id).not.toBe(entry.id);
		expect(running).toMatchObject({ started_at: prompt.end, ended_at: null, note: "Spec review", tagIds: [tag.id] });
		const state = s.db.query("SELECT entry_id FROM timer_state WHERE id = 1").get() as { entry_id: string };
		expect(state.entry_id).toBe(running.id);
		// No activity inside the idle time; the sampler now records for the new entry.
		for (const a of s.activity()) expect(a.ended_at <= idleStart || a.started_at >= prompt.end).toBe(true);
		s.run(5);
		s.tracking.sampler.flush();
		expect(s.activity().at(-1)!.entry_id).toBe(running.id);
		expect(s.db.query("SELECT resolution FROM idle_periods").get()).toEqual({ resolution: "discarded" });
		s.timer.stop();
	});

	test("discard and stop ends the entry at the idle start; keep changes nothing", () => {
		const s = setup();
		const entry = s.timer.start({ note: "", tagIds: [] });
		s.run(60);
		const idleStart = s.ctx.now();
		s.advance(30 * MIN);
		s.run(1);
		s.tracking.resolve(s.prompts[0].id, "discardStop");
		expect(s.timer.status()).toBeNull();
		expect(getEntry(s.db, entry.id)!.ended_at).toBe(idleStart);

		const second = s.timer.start({ note: "", tagIds: [] });
		s.run(60);
		s.advance(30 * MIN);
		s.run(1);
		s.tracking.resolve(s.prompts[1].id, "keep");
		expect(s.timer.status()?.id).toBe(second.id);
		expect(s.db.query("SELECT resolution FROM idle_periods ORDER BY started_at").all()).toEqual([
			{ resolution: "discarded" },
			{ resolution: "kept" },
		]);
		s.timer.stop();
	});
});

describe("startup", () => {
	test("pending idle periods are kept and old activity is deleted", () => {
		const s = setup();
		s.timer.start({ note: "", tagIds: [] });
		s.run(10);
		s.state.idleSeconds = 10 * 60;
		s.tracking.idle.poll(); // pending, never answered (crash)
		s.timer.stop();
		s.advance(100 * 24 * 60 * MIN); // 100 days later
		expect(s.tracking.startup()).toEqual({ keptIdle: 1, purged: 1 });
		expect(s.activity()).toEqual([]);
		expect(s.db.query("SELECT resolution FROM idle_periods").get()).toEqual({ resolution: "kept" });
	});
});
