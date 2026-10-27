import { expect, test } from "bun:test";
import { platformOf } from "./platform";

test("Bun and webview platform names map to the OS", () => {
	expect(platformOf("darwin")).toBe("macos");
	expect(platformOf("MacIntel")).toBe("macos");
	expect(platformOf("win32")).toBe("windows");
	expect(platformOf("Win32")).toBe("windows");
	expect(platformOf("linux")).toBe("linux");
	expect(platformOf("Linux x86_64")).toBe("linux");
	expect(platformOf("Linux aarch64")).toBe("linux");
});
