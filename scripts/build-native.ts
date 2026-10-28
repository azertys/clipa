// Electrobun preBuild hook: build the platform native library.
// Hutch runs this with Bun before it copies files into the bundle.
import { $ } from "bun";

const os = process.env.ELECTROBUN_OS ?? process.platform;

if (os === "macos" || os === "darwin") {
	await $`swift build -c release --package-path native/macos`;
} else {
	// Windows and Linux use the system's libraries through Bun FFI (src/bun/native).
	console.log(`build-native: nothing to build for ${os}`);
}
