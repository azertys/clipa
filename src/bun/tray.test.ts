import { describe, expect, mock, test } from "bun:test";
import type { MenuItemConfig } from "electrobun/main";
import { addLocalDays, startOfLocalDay } from "../../core/time";
import { saveEntry } from "./db/entries";
import { TimerService } from "./services/timer";
import { testDb } from "./test-helpers";

const MIN = 60_000;

/** Keeps the menus Clipa sets, in place of the native tray. */
class FakeTray {
	menus: MenuItemConfig[][] = [];
	setTitle() {}
	setImage() {}
	setMenu(menu: MenuItemConfig[]) {
		this.menus.push(menu);
	}
	on() {}
}

mock.module("electrobun/main", () => ({ Tray: FakeTray }));
const { ClipaTray } = await import("./tray");

const actions = { toggle() {}, continueWith() {}, openWindow() {}, quit() {} };
const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Clipa's tray at 10:00 today, local time. */
function setup() {
	const midnight = startOfLocalDay(Date.parse("2026-10-26T12:00:00Z"), tzid);
	const t = testDb(midnight + 10 * 60 * MIN);
	const timer = new TimerService({ db: t.db, ctx: t.ctx, onChange: () => {} });
	const clipaTray = new ClipaTray(t.db, timer, actions, t.ctx.now);
	const native = (clipaTray as unknown as { tray: FakeTray }).tray;
	const tick = () => (clipaTray as unknown as { tick(): void }).tick();
	const firstLabel = () => (native.menus.at(-1)![0] as { label: string }).label;
	return { ...t, midnight, timer, clipaTray, native, tick, firstLabel };
}

describe("today's total in the menu", () => {
	test("is the first item, and it can't be clicked", () => {
		const { native, timer } = setup();
		expect(native.menus.at(-1)!.slice(0, 2)).toEqual([
			{ type: "normal", label: "Today: 0:00", enabled: false },
			{ type: "separator" },
		]);
		timer.dispose();
	});

	test("counts only today's part of an entry from yesterday, and overlaps once", () => {
		const { db, ctx, midnight, clipaTray, firstLabel, timer } = setup();
		saveEntry(db, ctx, { started_at: midnight - 30 * MIN, ended_at: midnight + 60 * MIN, note: "", tagIds: [] });
		saveEntry(db, ctx, { started_at: midnight + 30 * MIN, ended_at: midnight + 90 * MIN, note: "", tagIds: [] });
		clipaTray.refresh();
		expect(firstLabel()).toBe("Today: 1:30");
		timer.dispose();
	});

	test("moves with a running timer, and the menu is set again only when it changes", () => {
		const { advance, clipaTray, native, tick, firstLabel, timer } = setup();
		timer.start({ note: "", tagIds: [] });
		clipaTray.refresh();
		const count = native.menus.length;
		advance(30_000);
		tick();
		expect(native.menus.length).toBe(count);
		advance(30_000);
		tick();
		expect(native.menus.length).toBe(count + 1);
		expect(firstLabel()).toBe("Today: 0:01");
		timer.dispose();
	});

	test("goes back to 0:00 after midnight", () => {
		const { db, ctx, midnight, setNow, clipaTray, tick, firstLabel, timer } = setup();
		saveEntry(db, ctx, { started_at: midnight + 60 * MIN, ended_at: midnight + 120 * MIN, note: "", tagIds: [] });
		clipaTray.refresh();
		expect(firstLabel()).toBe("Today: 1:00");
		setNow(addLocalDays(midnight, 1, tzid) + MIN);
		tick();
		expect(firstLabel()).toBe("Today: 0:00");
		timer.dispose();
	});
});
