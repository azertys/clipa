import type { ElectrobunConfig } from "electrobun";

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
			"native/macos/.build/release/libclipanative.dylib": "native/libclipanative.dylib",
			// Template images: macOS tints them for the menu bar (assets/README.md).
			"assets/tray/macos": "views/tray",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**", "native/macos/.build/**"],
		mac: {
			bundleCEF: false,
			// Made from assets/logo/clipa-mark.svg by scripts/make-app-icon.swift.
			icons: "assets/icon.iconset",
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
