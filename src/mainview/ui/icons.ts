// Stroke icons on a 24 × 24 grid, from clipa-ui-svelte. `fill: true` icons are filled with currentColor.
export const icons = {
	logo: { d: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M10 2h4" },
	today: { d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
	entries: { d: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" },
	calendar: { d: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4" },
	reports: { d: "M3 20h18M6 16v-5M11 16V5M16 16v-8" },
	settings: { d: "M4 7h9M17 7h3M4 17h3M11 17h9M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
	play: { d: "M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z", fill: true },
	stop: { d: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z", fill: true },
	more: { d: "M5 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM19 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z", fill: true },
	plus: { d: "M12 5v14M5 12h14" },
	close: { d: "M6 6l12 12M18 6L6 18" },
	"chevron-left": { d: "M15 6l-6 6 6 6" },
	"chevron-right": { d: "M9 6l6 6-6 6" },
	"chevron-down": { d: "M6 9l6 6 6-6" },
	search: { d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" },
	tag: { d: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM7.5 8.7a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" },
	repeat: { d: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" },
	edit: { d: "M4 20h4L19 9l-4-4L4 16z" },
	trash: { d: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" },
	download: { d: "M12 4v11M7 10l5 5 5-5M5 20h14" },
} as const satisfies Record<string, { d: string; fill?: boolean }>;

export type IconName = keyof typeof icons;
