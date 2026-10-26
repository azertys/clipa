import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings, writeSettings } from "../db/settings";
import { testDb } from "../test-helpers";
import { Backups } from "./backups";

const DAY = 24 * 3_600_000;
const folders: string[] = [];
afterEach(() => {
	for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});

function setup() {
	const t = testDb(Date.parse("2026-10-26T07:00:00Z"));
	const folder = mkdtempSync(join(tmpdir(), "clipa-backups-"));
	folders.push(folder);
	const backups = new Backups({
		db: t.db,
		now: t.ctx.now,
		tzid: () => "Europe/Bucharest",
		settings: () => readSettings(t.db),
		defaultFolder: join(folder, "backups"),
	});
	const files = () => readdirSync(backups.folder()).sort();
	return { ...t, folder, backups, files };
}

describe("automatic backup (spec section 9)", () => {
	test("one copy per local day, made at the first check", () => {
		const s = setup();
		expect(s.backups.daily()).toEndWith("clipa-2026-10-26.db");
		expect(s.backups.daily()).toBeNull();
		s.advance(DAY);
		s.backups.daily();
		expect(s.files()).toEqual(["clipa-2026-10-26.db", "clipa-2026-10-27.db"]);
		expect(s.backups.status().lastAt).not.toBeNull();
	});

	test("keeps the last 14 copies and leaves other files alone", () => {
		const s = setup();
		s.backups.daily();
		writeFileSync(join(s.backups.folder(), "notes.txt"), "mine");
		for (let i = 1; i < 16; i++) {
			s.advance(DAY);
			s.backups.daily();
		}
		const files = s.files();
		expect(files.filter((f) => f.endsWith(".db"))).toHaveLength(14);
		expect(files[0]).toBe("clipa-2026-10-28.db");
		expect(files).toContain("notes.txt");
	});

	test("nothing when automatic backup is off", () => {
		const s = setup();
		writeSettings(s.db, { autoBackup: false });
		expect(s.backups.daily()).toBeNull();
		expect(s.backups.status().lastAt).toBeNull();
	});

	test("a chosen folder is used", () => {
		const s = setup();
		const chosen = join(s.folder, "chosen");
		writeSettings(s.db, { backupFolder: chosen });
		expect(s.backups.daily()).toBe(join(chosen, "clipa-2026-10-26.db"));
	});

	test("a copy before each import, whatever the setting", () => {
		const s = setup();
		writeSettings(s.db, { autoBackup: false });
		// 07:00Z is 09:00 in Bucharest.
		expect(s.backups.beforeImport()).toEndWith("clipa-before-import-2026-10-26-090000.db");
	});
});
