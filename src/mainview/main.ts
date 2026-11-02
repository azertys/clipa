// Fonts of the retro theme, bundled so that they work offline. A font file loads only when it is used.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./ui/tokens.css";
import "./app.css";
import App from "./App.svelte";
import IdleWindow from "./IdleWindow.svelte";
import { applyTheme, startTheme } from "./lib/theme";
import { mount } from "svelte";

applyTheme(startTheme);

// The idle question has a small window of its own, which loads this view with #idle (index.ts).
const app = mount(new URLSearchParams(location.hash.slice(1)).has("idle") ? IdleWindow : App, {
	target: document.getElementById("app")!,
});

export default app;
