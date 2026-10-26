import type { Database } from "bun:sqlite";
import { Tray, type MenuItemConfig } from "electrobun/main";
import { firstLine, recentCombos, type Combo } from "../../core/entries";
import { formatDuration } from "../../core/time";
import { strings } from "../mainview/strings";
import { recentEntries } from "./db/entries";
import { listTags } from "./db/tags";
import type { TimerService } from "./services/timer";

const TITLE_REFRESH_MS = 30_000;
const CONTINUE_COUNT = 5;

export type TrayActions = {
	toggle(): void;
	continueWith(combo: Combo): void;
	openWindow(): void;
	quit(): void;
};

export class ClipaTray {
	private readonly tray: Tray;
	private titleTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly db: Database,
		private readonly timer: TimerService,
		private readonly actions: TrayActions,
		private readonly now: () => number = Date.now,
	) {
		this.tray = new Tray({ title: "", image: "views://tray/idle.png", template: true, width: 18, height: 18 });
		this.refresh();
		this.tray.on("tray-clicked", (event: unknown) => {
			const { action, data } = (event as { data: { action: string; data?: unknown } }).data;
			if (action === "toggle") this.actions.toggle();
			else if (action === "continue") this.actions.continueWith(data as Combo);
			else if (action === "open") this.actions.openWindow();
			else if (action === "quit") this.actions.quit();
		});
	}

	/** Updates the icon, title and menu from the database. */
	refresh(): void {
		const running = this.timer.status();
		this.tray.setImage(running ? "views://tray/running.png" : "views://tray/idle.png");
		this.updateTitle();
		if (running && !this.titleTimer) {
			this.titleTimer = setInterval(() => this.updateTitle(), TITLE_REFRESH_MS);
		} else if (!running && this.titleTimer) {
			clearInterval(this.titleTimer);
			this.titleTimer = null;
		}
		this.tray.setMenu(this.menu(running !== null));
	}

	private updateTitle() {
		const running = this.timer.status();
		this.tray.setTitle(running ? formatDuration(this.now() - running.started_at) : "");
	}

	private menu(running: boolean): MenuItemConfig[] {
		const tagNames = new Map(listTags(this.db).map((t) => [t.id, t.name]));
		const combos = recentCombos(recentEntries(this.db, 200), CONTINUE_COUNT);
		const comboLabel = (c: Combo) => {
			const note = firstLine(c.note) || strings.tray.noNote;
			const tags = c.tagIds.map((id) => tagNames.get(id)).filter(Boolean);
			const label = tags.length ? `${note} · ${tags.join(", ")}` : note;
			return label.length > 60 ? `${label.slice(0, 59)}…` : label;
		};
		return [
			{ type: "normal", label: running ? strings.tray.stop : strings.tray.start, action: "toggle" },
			{
				type: "normal",
				label: strings.tray.continue,
				enabled: combos.length > 0,
				submenu: combos.length
					? combos.map((c) => ({ type: "normal", label: comboLabel(c), action: "continue", data: c }))
					: [{ type: "normal", label: strings.tray.continueEmpty, enabled: false }],
			},
			{ type: "separator" },
			{ type: "normal", label: strings.tray.openWindow, action: "open" },
			{ type: "normal", label: strings.tray.quit, action: "quit" },
		];
	}
}
