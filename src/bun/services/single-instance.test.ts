import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "../../shared/platform";
import { claimInstance, instanceAddress } from "./single-instance";

const address = () => instanceAddress(platform, mkdtempSync(join(tmpdir(), "clipa-instance-")));

async function until(done: () => boolean) {
	for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(10);
}

test("the address is a named pipe on Windows and a socket file elsewhere", () => {
	expect(instanceAddress("linux", "/home/a/.local/share/dev.clipa.app/stable")).toBe(
		"/home/a/.local/share/dev.clipa.app/stable/clipa.sock",
	);
	const pipe = instanceAddress("windows", "C:\\Users\\A\\AppData\\Local\\dev.clipa.app\\stable");
	expect(pipe).toMatch(/^\\\\\.\\pipe\\clipa-[0-9a-f]{16}$/);
	expect(instanceAddress("windows", "c:\\users\\a\\appdata\\local\\dev.clipa.app\\stable")).toBe(pipe);
	expect(instanceAddress("windows", "C:\\Users\\A\\AppData\\Local\\dev.clipa.app\\dev")).not.toBe(pipe);
});

test("a second start asks the first to show its window", async () => {
	const at = address();
	const shown: string[] = [];
	expect(await claimInstance(at, () => shown.push("first"))).toBe(true);
	expect(await claimInstance(at, () => shown.push("second"))).toBe(false);
	await until(() => shown.length > 0);
	expect(shown).toEqual(["first"]);
});

test.skipIf(platform === "windows")("a socket file left by a crash does not stop the start", async () => {
	const at = address();
	writeFileSync(at, "");
	const shown: string[] = [];
	expect(await claimInstance(at, () => shown.push("first"))).toBe(true);
	expect(await claimInstance(at, () => shown.push("second"))).toBe(false);
	await until(() => shown.length > 0);
	expect(shown).toEqual(["first"]);
});
