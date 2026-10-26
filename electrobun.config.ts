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
			"assets/tray": "views/tray",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**", "native/macos/.build/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
