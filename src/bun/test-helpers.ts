import { Database } from "bun:sqlite";
import { migrate } from "./db/database";
import type { WriteContext } from "./db/repo";

/** A migrated in-memory database and a write context with a clock the test controls. */
export function testDb(start = Date.parse("2026-10-26T07:00:00Z")) {
	const db = new Database(":memory:", { strict: true });
	db.exec("PRAGMA foreign_keys = ON");
	migrate(db);
	let now = start;
	const ctx: WriteContext = { deviceId: "device-a", now: () => now };
	return {
		db,
		ctx,
		advance(ms: number) {
			now += ms;
		},
		setNow(ms: number) {
			now = ms;
		},
	};
}
