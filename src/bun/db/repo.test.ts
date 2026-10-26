import { describe, expect, test } from "bun:test";
import { testDb } from "../test-helpers";
import { deleteEntry, getEntry, listEntries, saveEntry } from "./entries";
import { deleteTag, listTags, saveTag } from "./tags";

const HOUR = 3_600_000;

describe("tags", () => {
	test("create, find by name case-insensitively, rename", () => {
		const { db, ctx, advance } = testDb();
		const work = saveTag(db, ctx, { name: " Work " });
		expect(work.name).toBe("Work");
		expect(work.device_id).toBe("device-a");
		// The combobox flow: the same name returns the existing tag.
		expect(saveTag(db, ctx, { name: "work" }).id).toBe(work.id);
		advance(1000);
		const renamed = saveTag(db, ctx, { id: work.id, name: "Client work", color: "#f00" });
		expect(renamed.updated_at).toBe(work.created_at + 1000);
		expect(renamed.created_at).toBe(work.created_at);
		expect(listTags(db).map((t) => t.name)).toEqual(["Client work"]);
	});

	test("rename to a taken name fails", () => {
		const { db, ctx } = testDb();
		saveTag(db, ctx, { name: "A" });
		const b = saveTag(db, ctx, { name: "B" });
		expect(() => saveTag(db, ctx, { id: b.id, name: "a" })).toThrow("TAG_NAME_TAKEN");
		expect(() => saveTag(db, ctx, { name: "  " })).toThrow("TAG_NAME_EMPTY");
	});

	test("deleting a tag keeps the entries and frees the name", () => {
		const { db, ctx, advance } = testDb();
		const tag = saveTag(db, ctx, { name: "Work" });
		const start = ctx.now() - 2 * HOUR;
		const entry = saveEntry(db, ctx, { started_at: start, ended_at: start + HOUR, note: "x", tagIds: [tag.id] });
		expect(entry.tagIds).toEqual([tag.id]);
		advance(1000);
		deleteTag(db, ctx, tag.id);
		expect(listTags(db)).toEqual([]);
		const after = getEntry(db, entry.id)!;
		expect(after.deleted_at).toBeNull();
		expect(after.tagIds).toEqual([]);
		const link = db.query("SELECT deleted_at FROM entry_tags WHERE entry_id = ?").get(entry.id) as {
			deleted_at: number;
		};
		expect(link.deleted_at).toBe(ctx.now());
		// A new tag can use the old name.
		expect(saveTag(db, ctx, { name: "work" }).id).not.toBe(tag.id);
	});
});

describe("entries", () => {
	test("create, update tags, revive a removed tag link", () => {
		const { db, ctx, advance } = testDb();
		const a = saveTag(db, ctx, { name: "A" });
		const b = saveTag(db, ctx, { name: "B" });
		const start = ctx.now() - 3 * HOUR;
		const e = saveEntry(db, ctx, { started_at: start, ended_at: start + HOUR, note: "Spec\nmore", tagIds: [a.id] });
		advance(1);
		saveEntry(db, ctx, { ...e, tagIds: [b.id] });
		expect(getEntry(db, e.id)!.tagIds).toEqual([b.id]);
		advance(1);
		const again = saveEntry(db, ctx, { ...e, tagIds: [a.id, b.id] });
		expect(again.tagIds.sort()).toEqual([a.id, b.id].sort());
		// Still two link rows: the removed one was revived, not duplicated.
		expect((db.query("SELECT count(*) AS n FROM entry_tags").get() as { n: number }).n).toBe(2);
	});

	test("validation", () => {
		const { db, ctx } = testDb();
		const now = ctx.now();
		expect(() => saveEntry(db, ctx, { started_at: now - HOUR, ended_at: now - HOUR, note: "", tagIds: [] })).toThrow(
			"ENTRY_END_BEFORE_START",
		);
		expect(() => saveEntry(db, ctx, { started_at: now - HOUR, ended_at: null, note: "", tagIds: [] })).toThrow(
			"ENTRY_END_REQUIRED",
		);
		expect(() => saveEntry(db, ctx, { started_at: now + HOUR, ended_at: now + 2 * HOUR, note: "", tagIds: [] })).toThrow(
			"ENTRY_START_IN_FUTURE",
		);
		expect(() => saveEntry(db, ctx, { id: "missing", started_at: 0, ended_at: 1, note: "", tagIds: [] })).toThrow(
			"ENTRY_NOT_FOUND",
		);
	});

	test("listEntries returns live entries that touch the range, newest first", () => {
		const { db, ctx } = testDb();
		const t = ctx.now() - 10 * HOUR;
		const e1 = saveEntry(db, ctx, { started_at: t, ended_at: t + HOUR, note: "1", tagIds: [] });
		const e2 = saveEntry(db, ctx, { started_at: t + 2 * HOUR, ended_at: t + 3 * HOUR, note: "2", tagIds: [] });
		const e3 = saveEntry(db, ctx, { started_at: t + 4 * HOUR, ended_at: t + 5 * HOUR, note: "3", tagIds: [] });
		deleteEntry(db, ctx, e3.id);
		expect(listEntries(db, t + HOUR, t + 6 * HOUR).map((e) => e.id)).toEqual([e2.id]);
		expect(listEntries(db, t, t + 6 * HOUR).map((e) => e.id)).toEqual([e2.id, e1.id]);
		// Soft delete keeps the row.
		expect(getEntry(db, e3.id)!.deleted_at).toBe(ctx.now());
	});
});
