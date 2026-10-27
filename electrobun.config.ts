import type { ElectrobunConfig } from "electrobun";

// Signing and notarization turn on when their credentials are in the environment (docs/release.md).
// Without them the build is unsigned, which is enough for this Mac.
const env = process.env;
const signed = Boolean(env.ELECTROBUN_DEVELOPER_ID);
const notarized =
	signed &&
	(Boolean(env.ELECTROBUN_APPLEAPIKEY && env.ELECTROBUN_APPLEAPIISSUER) ||
		Boolean(env.ELECTROBUN_APPLEID && env.ELECTROBUN_APPLEIDPASS && env.ELECTROBUN_TEAMID));

// Hutch builds only for the OS it runs on (docs/release.md), so each OS copies its own files.
// The tray images are in assets/tray (assets/README.md); src/bun/tray.ts picks them by name.
const platformCopy: Record<string, Record<string, string>> = {
	darwin: {
		"native/macos/.build/release/libclipanative.dylib": "native/libclipanative.dylib",
		// Template images: macOS tints them for the menu bar.
		"assets/tray/macos": "views/tray",
	},
	win32: { "assets/tray/windows": "views/tray" },
	// AppIndicator takes a PNG file: the Windows PNGs.
	linux: { "assets/tray/windows/png": "views/tray" },
};

export default {
	app: {
		name: "Clipa",
		identifier: "dev.clipa.app",
		version: "0.1.0",
	},
	runtime: {
		// Clipa lives in the tray. Closing the main window does not quit the app.
		exitOnLastWindowClosed: false,
	},
	scripts: {
		// Builds native/macos into libclipanative.dylib before the copy step.
		preBuild: "./scripts/build-native.ts",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			...platformCopy[process.platform],
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**", "native/macos/.build/**"],
		mac: {
			bundleCEF: false,
			// Made from assets/logo/clipa-mark.svg by scripts/make-app-icon.swift.
			icons: "assets/icon.iconset",
			// Hutch also signs the nested Mach-O files, so the dylib gets the app's identity (spec section 8).
			codesign: signed,
			notarize: notarized,
		},
		linux: {
			bundleCEF: false,
			icon: "assets/icon.iconset/icon_512x512.png",
		},
		win: {
			bundleCEF: false,
			// Hutch makes the .ico from the PNG.
			icon: "assets/icon.iconset/icon_256x256.png",
		},
	},
} satisfies ElectrobunConfig;
