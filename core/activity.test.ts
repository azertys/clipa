import { describe, expect, test } from "bun:test";
import { planIdleDiscard, Segmenter, type ActivityRow, type Sample } from "./activity";

const SEC = 1000;
const MIN = 60 * SEC;

function segmenter() {
	let n = 0;
	return new Segmenter(() => `s${++n}`);
}
const sample = (at: number, appKey: string, title: string | null = null): Sample => ({
	at,
	appKey,
	appName: appKey.toUpperCase(),
	title,
});

describe("Segmenter", () => {
	test("the same app and title keep one segment open; a change closes it", () => {
		const seg = segmenter();
		expect(seg.sample(sample(0, "code")).writes).toEqual([]);
		expect(seg.sample(sample(1 * SEC, "code")).writes).toEqual([]);
		expect(seg.sample(sample(5 * SEC, "code")).writes).toEqual([]);
		const { writes } = seg.sample(sample(6 * SEC, "mail"));
		expect(writes).toEqual([{ id: "s1", appKey: "code", appName: "CODE", title: null, start: 0, end: 6 * SEC }]);
		expect(seg.current()).toMatchObject({ id: "s2", appKey: "mail", start: 6 * SEC });
	});

	test("a title change is a new segment", () => {
		const seg = segmenter();
		seg.sample(sample(0, "safari", "A"));
		expect(seg.sample(sample(3 * SEC, "safari", "B")).writes).toEqual([
			expect.objectContaining({ title: "A", end: 3 * SEC }),
		]);
	});

	test("a segment shorter than 2 s joins the previous segment", () => {
		const seg = segmenter();
		seg.sample(sample(0, "code"));
		seg.sample(sample(10 * SEC, "mail")); // closes code 0–10
		const { writes } = seg.sample(sample(11 * SEC, "code")); // mail lasted 1 s
		expect(writes).toEqual([expect.objectContaining({ id: "s1", appKey: "code", start: 0, end: 11 * SEC })]);
	});

	test("a short first segment with nothing before it is dropped", () => {
		const seg = segmenter();
		seg.sample(sample(0, "mail"));
		expect(seg.sample(sample(1 * SEC, "code")).writes).toEqual([]);
	});

	test("flush writes the open segment and keeps it open with the same id", () => {
		const seg = segmenter();
		seg.sample(sample(0, "code"));
		expect(seg.flush(1 * SEC)).toEqual([]);
		for (let t = 1; t <= 30; t++) seg.sample(sample(t * SEC, "code"));
		expect(seg.flush(30 * SEC)).toEqual([expect.objectContaining({ id: "s1", end: 30 * SEC })]);
		seg.sample(sample(31 * SEC, "code"));
		expect(seg.sample(sample(32 * SEC, "mail")).writes).toEqual([expect.objectContaining({ id: "s1", end: 32 * SEC })]);
	});

	test("a gap over 15 s closes the segment at the last sample and reports the gap", () => {
		const seg = segmenter();
		seg.sample(sample(0, "code"));
		seg.sample(sample(10 * SEC, "code"));
		const { writes, gap } = seg.sample(sample(10 * MIN, "code"));
		expect(gap).toEqual({ start: 10 * SEC, end: 10 * MIN });
		expect(writes).toEqual([expect.objectContaining({ id: "s1", start: 0, end: 10 * SEC })]);
		expect(seg.current()).toMatchObject({ id: "s2", start: 10 * MIN });
	});

	test("resume after a blocking dialog: no gap, the open segment runs on", () => {
		const seg = segmenter();
		seg.sample(sample(0, "clipa"));
		seg.sample(sample(10 * SEC, "clipa"));
		seg.resume(2 * MIN);
		const { writes, gap } = seg.sample(sample(2 * MIN + SEC, "clipa"));
		expect(gap).toBeNull();
		expect(writes).toEqual([]);
		expect(seg.current()).toMatchObject({ id: "s1", start: 0, end: 2 * MIN + SEC });
	});

	test("resume before the first sample does nothing", () => {
		const seg = segmenter();
		seg.resume(MIN);
		expect(seg.sample(sample(MIN + SEC, "code")).gap).toBeNull();
		expect(seg.current()).toMatchObject({ start: MIN + SEC });
	});

	test("a sample without an app closes the open segment", () => {
		const seg = segmenter();
		for (let t = 0; t <= 5; t++) seg.sample(sample(t * SEC, "code"));
		expect(seg.none(6 * SEC)).toEqual({
			writes: [expect.objectContaining({ id: "s1", start: 0, end: 6 * SEC })],
			gap: null,
		});
		expect(seg.current()).toBeNull();
		expect(seg.none(7 * SEC).writes).toEqual([]);
		expect(seg.sample(sample(8 * SEC, "code")).writes).toEqual([]);
		expect(seg.current()).toMatchObject({ id: "s2", start: 8 * SEC });
	});

	test("samples without an app still show a sleep", () => {
		const seg = segmenter();
		seg.none(0);
		seg.none(SEC);
		expect(seg.none(10 * MIN).gap).toEqual({ start: SEC, end: 10 * MIN });
		expect(seg.sample(sample(10 * MIN + SEC, "code")).gap).toBeNull();
	});

	test("stop closes the open segment", () => {
		const seg = segmenter();
		seg.sample(sample(0, "code"));
		expect(seg.stop(5 * SEC)).toEqual([expect.objectContaining({ end: 5 * SEC })]);
		expect(seg.current()).toBeNull();
	});
});

describe("planIdleDiscard (spec section 12)", () => {
	const at = (h: number, m = 0) => (h * 60 + m) * MIN;
	const row = (id: string, from: number, to: number): ActivityRow => ({
		id,
		entry_id: "e1",
		app_id: id.toUpperCase(),
		window_title: null,
		started_at: from,
		ended_at: to,
	});
	const activity = [
		row("a", at(9), at(9, 50)), // before the idle time
		row("b", at(9, 50), at(10, 10)), // across the idle start
		row("c", at(10, 10), at(10, 20)), // inside
		row("d", at(10, 25), at(10, 40)), // across the idle end
		row("e", at(10, 40), at(11)), // after
	];
	const idle = { start: at(10), end: at(10, 30) };
	let n = 0;
	const newId = () => `new${++n}`;

	test("discard in the middle of a running entry gives two entries; activity inside is deleted", () => {
		const plan = planIdleDiscard({ entry: { started_at: at(9), ended_at: null }, idle, activity, stop: false, newId })!;
		expect(plan.first).toEqual({ ended_at: at(10), deleted: false });
		expect(plan.second).toEqual({ started_at: at(10, 30), ended_at: null });
		expect(plan.deletes).toEqual(["c"]);
		expect(plan.upserts).toEqual([
			{ ...activity[1], ended_at: at(10) },
			{ ...activity[3], entry_id: "", started_at: at(10, 30) },
			{ ...activity[4], entry_id: "" },
		]);
	});

	test("a row across the whole idle time is split in two", () => {
		const long = row("x", at(9, 30), at(10, 45));
		const plan = planIdleDiscard({ entry: { started_at: at(9), ended_at: null }, idle, activity: [long], stop: false, newId })!;
		expect(plan.upserts).toEqual([
			{ ...long, ended_at: at(10) },
			expect.objectContaining({ entry_id: "", started_at: at(10, 30), ended_at: at(10, 45) }),
		]);
		expect(plan.upserts[1].id).not.toBe("x");
	});

	test("discard and stop ends the entry at the idle start and deletes later activity", () => {
		const plan = planIdleDiscard({ entry: { started_at: at(9), ended_at: null }, idle, activity, stop: true, newId })!;
		expect(plan.first).toEqual({ ended_at: at(10), deleted: false });
		expect(plan.second).toBeNull();
		expect(plan.deletes).toEqual(["c", "d", "e"]);
		expect(plan.upserts).toEqual([{ ...activity[1], ended_at: at(10) }]);
	});

	test("an entry stopped during the idle time: the second part ends where the entry ended", () => {
		const plan = planIdleDiscard({
			entry: { started_at: at(9), ended_at: at(11) },
			idle,
			activity: [],
			stop: false,
			newId,
		})!;
		expect(plan.second).toEqual({ started_at: at(10, 30), ended_at: at(11) });
		const inside = planIdleDiscard({ entry: { started_at: at(9), ended_at: at(10, 15) }, idle, activity: [], stop: false, newId })!;
		expect(inside.first.ended_at).toBe(at(10));
		expect(inside.second).toBeNull();
	});

	test("idle time from the entry start deletes the first part", () => {
		const plan = planIdleDiscard({ entry: { started_at: at(10), ended_at: null }, idle, activity: [], stop: false, newId })!;
		expect(plan.first).toEqual({ ended_at: at(10) + SEC, deleted: true });
		expect(plan.second).toEqual({ started_at: at(10, 30), ended_at: null });
	});

	test("idle time outside the entry changes nothing", () => {
		expect(
			planIdleDiscard({ entry: { started_at: at(11), ended_at: null }, idle, activity: [], stop: false, newId }),
		).toBeNull();
	});
});
