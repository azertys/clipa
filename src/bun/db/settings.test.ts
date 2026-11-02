import { describe, expect, test } from "bun:test";
import type { ThemeName } from "../../shared/rpc-schema";
import { testDb } from "../test-helpers";
import { readSettings, setSetting, writeSettings } from "./settings";

describe("theme", () => {
	test("is dark by default and keeps a change", () => {
		const { db } = testDb();
		expect(readSettings(db).theme).toBe("dark");
		expect(writeSettings(db, { theme: "retro" }).theme).toBe("retro");
		expect(readSettings(db).theme).toBe("retro");
	});

	test("an unknown theme is refused, and an unknown stored value reads as dark", () => {
		const { db } = testDb();
		writeSettings(db, { theme: "neon" as ThemeName });
		expect(readSettings(db).theme).toBe("dark");
		setSetting(db, "theme", "neon");
		expect(readSettings(db).theme).toBe("dark");
	});
});
