// The quick-capture window's own page (capture.html): only the box, its two fonts and the styles it
// uses — not the app's bundle (editor, terminal, PDF…), so the window paints as soon as it opens.
// `/#capture` on the app's page still works (main.ts); this is the fast route the desktop app uses.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/chrome.css";
import { mount } from "svelte";
import CaptureWindow from "./CaptureWindow.svelte";

export default mount(CaptureWindow, { target: document.getElementById("app")! });
