import type { ElectrobunConfig } from "electrobun";

// Signing and notarization turn on when their credentials are in the environment (README.md).
// Without them the build is unsigned.
const env = process.env;
const signed = Boolean(env.ELECTROBUN_DEVELOPER_ID);
const notarized =
	signed &&
	(Boolean(env.ELECTROBUN_APPLEAPIKEY && env.ELECTROBUN_APPLEAPIISSUER) ||
		Boolean(env.ELECTROBUN_APPLEID && env.ELECTROBUN_APPLEIDPASS && env.ELECTROBUN_TEAMID));

// Hutch builds only for the OS it runs on, so each OS copies its own files.
// The tray images are in assets/tray (assets/README.md); src/bun/tray.ts picks them by name.
const platformCopy: Record<string, Record<string, string>> = {
	darwin: {
		"native/macos/.build/release/libclipanative.dylib": "native/libclipanative.dylib",
		// Template images: macOS tints them for the menu bar.
		"assets/tray/macos": "views/tray",
	},
	win32: { "assets/tray/windows": "views/tray" },
	// AppIndicator takes a PNG file.
	linux: { "assets/tray/linux": "views/tray" },
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
		// Signs an unsigned macOS build ad hoc, before the DMG is made.
		postWrap: "./scripts/sign-adhoc.ts",
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
			// An Icon Composer icon: the clock is a layer, so macOS draws the light, dark, clear and
			// tinted styles. Hutch compiles it with Xcode's actool (Assets.car and an .icns fallback).
			icons: "assets/Clipa.icon",
			// Hutch also signs the nested Mach-O files, so the dylib gets the app's identity.
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
