// Electrobun postWrap hook: sign an unsigned macOS app ad hoc.
// Without a Developer ID only the executable has a (linker) signature, and the rest of the bundle
// is not sealed, so macOS calls a downloaded copy "damaged". With a whole-bundle ad hoc signature,
// the user can open it with "Open Anyway" in System Settings > Privacy & Security.
import { $ } from "bun";

const os = process.env.ELECTROBUN_OS ?? process.platform;
const bundle = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;

if ((os === "macos" || os === "darwin") && bundle && !process.env.ELECTROBUN_DEVELOPER_ID) {
	await $`codesign --force --deep --sign - ${bundle}`;
	await $`codesign --verify --deep --strict ${bundle}`;
	console.log(`sign-adhoc: signed ${bundle}`);
}
