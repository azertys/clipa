import "./ui/tokens.css";
import "./app.css";
import App from "./App.svelte";
import IdleWindow from "./IdleWindow.svelte";
import { mount } from "svelte";

// The idle question has a small window of its own, which loads this view with #idle (index.ts).
const app = mount(location.hash === "#idle" ? IdleWindow : App, {
	target: document.getElementById("app")!,
});

export default app;
