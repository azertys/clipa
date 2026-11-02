// The themes. Colors, lines, fonts and shadows are CSS variables in ui/tokens.css, one block per theme;
// the data-theme attribute on <html> picks the block. The traits are the layout differences.
import type { ThemeName } from "../../shared/rpc-schema";

export type ThemeTraits = {
	/** Navigation: a sidebar, or a bar above the page */
	nav: "sidebar" | "topbar";
	/** Start and stop: buttons, or a big round key */
	timerButton: "block" | "round";
	/** A three-color stripe on top of the timer card */
	stripe: boolean;
	/** Coverage meters: a thin bar, or a row of 10 squares */
	coverage: "bar" | "squares";
	/** The logo: white on a dark background, ink on a light one */
	logo: "white" | "ink";
};

export const themeOrder: ThemeName[] = ["dark", "retro"];

export const themeTraits: Record<ThemeName, ThemeTraits> = {
	dark: { nav: "sidebar", timerButton: "block", stripe: false, coverage: "bar", logo: "white" },
	retro: { nav: "topbar", timerButton: "round", stripe: true, coverage: "squares", logo: "ink" },
};

const hashTheme = new URLSearchParams(location.hash.slice(1)).get("theme");

/** The theme in the window's hash, "#theme=retro" (index.ts), for the first paint. */
export const startTheme: ThemeName = themeOrder.find((name) => name === hashTheme) ?? "dark";

export function applyTheme(name: ThemeName) {
	document.documentElement.dataset.theme = name;
}
