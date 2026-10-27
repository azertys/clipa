import type { Database } from "bun:sqlite";
import { Tray, type MenuItemConfig } from "electrobun/main";
import { firstLine, recentCombos, type Combo } from "../../core/entries";
import { formatDuration } from "../../core/time";
import { strings } from "../mainview/strings";
import { platform } from "../shared/platform";
import { recentEntries } from "./db/entries";
import { readSettings } from "./db/settings";
import { listTags } from "./db/tags";
import type { TimerService } from "./services/timer";

const TITLE_REFRESH_MS = 30_000;
const CONTINUE_COUNT = 5;

type TrayIcons = { idle: string; running: string; template: boolean };

/** This OS's tray images (assets/README.md). build.copy puts them in views/tray. */
function trayIcons(): TrayIcons {
	switch (platform) {
		case "macos":
			// 32 px images shown at 16 pt, so they stay sharp on Retina menu bars. Both are template
			// images with the same shape; the elapsed time next to the icon shows that the timer runs.
			return {
				idle: "views://tray/ClipaTrayIdleTemplate@2x.png",
				running: "views://tray/ClipaTrayRunningTemplate@2x.png",
				template: true,
			};
		case "windows": {
			// Each .ico has the sizes from 16 to 48 px. The colors follow the taskbar's theme.
			const theme = windowsTaskbarIsLight() ? "light" : "dark";
			return {
				idle: `views://tray/clipa-tray-idle-${theme}.ico`,
				running: `views://tray/clipa-tray-running-${theme}.ico`,
				template: false,
			};
		}
		case "linux":
			// AppIndicator scales the image to the panel. Most panels are dark.
			return {
				idle: "views://tray/clipa-tray-idle-dark-48.png",
				running: "views://tray/clipa-tray-running-dark-48.png",
				template: false,
			};
	}
}

/** The taskbar's theme can differ from the app theme (assets/README.md). Read once, at start. */
function windowsTaskbarIsLight(): boolean {
	const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
	const result = Bun.spawnSync(["reg", "query", key, "/v", "SystemUsesLightTheme"], { windowsHide: true });
	return /SystemUsesLightTheme\s+REG_DWORD\s+0x1\b/.test(result.stdout.toString());
}

export type TrayActions = {
	toggle(): void;
	continueWith(combo: Combo): void;
	openWindow(): void;
	quit(): void;
};

export class ClipaTray {
	private readonly tray: Tray;
	private readonly icons = trayIcons();
	private titleTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly db: Database,
		private readonly timer: TimerService,
		private readonly actions: TrayActions,
		private readonly now: () => number = Date.now,
	) {
		this.tray = new Tray({ title: "", image: this.icons.idle, template: this.icons.template, width: 16, height: 16 });
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
		this.tray.setImage(running ? this.icons.running : this.icons.idle);
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
		const elapsed = running ? formatDuration(this.now() - running.started_at) : null;
		if (platform === "macos") {
			this.tray.setTitle(elapsed && readSettings(this.db).showTrayTimer ? elapsed : "");
		} else {
			// Windows shows the title as the icon's tooltip, so it always names the app.
			this.tray.setTitle(elapsed ? `${strings.appName} · ${elapsed}` : strings.appName);
		}
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
