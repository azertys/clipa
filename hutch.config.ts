// @hutch cli=0.28.2 cottontail=0.7.3
export default {
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		"dev:hmr": ["hutch", "pm", "exec", "--", "concurrently", "hutch run hmr", "hutch run start"],
		hmr: "hutch electrobun prepare && hutch pm exec -- vite --port 5173",
		build: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
		"build:canary": "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=canary",
		native: ["swift", "build", "-c", "release", "--package-path", "native/macos"],
		icon: ["swift", "scripts/make-app-icon.swift", "assets/logo/clipa-mark.svg", "assets/icon.iconset"],
		"icon:mac": ["swift", "scripts/make-icon-mark.swift", "assets/Clipa.icon/Assets/clock.svg"],
		test: ["hutch", "test", "core", "src/bun", "src/shared"],
		check: "hutch electrobun prepare && hutch pm exec -- svelte-check --tsconfig ./tsconfig.json",
	},
	electrobun: {
		version: "2.0.5",
	},
};
