import { test, expect, type Browser } from "@playwright/test";
import { appChord, keyText, matches, onThisSystem, parseChord } from "../src/lib/keys";

// Atlas's app keys are written with Super; on a Mac Super is Ctrl+Cmd (Cmd is the system's copy and paste), on Windows
// Ctrl+Alt (Windows keeps its Win keys), and a Windows default already on that Ctrl+Alt key moves to Ctrl+Alt+Shift.

test("Super is typed as each system's own modifiers", () => {
  expect(onThisSystem("Super+V", "linux")).toBe("Super+V");
  expect(onThisSystem("Super+V", "mac")).toBe("Ctrl+Cmd+V");
  expect(onThisSystem("Super+Shift+L", "windows")).toBe("Ctrl+Alt+Shift+L");
  expect(onThisSystem("Ctrl+Super+K", "windows")).toBe("Ctrl+Alt+K"); // no Ctrl twice
  expect(onThisSystem("Ctrl+Alt+B", "windows")).toBe("Ctrl+Alt+B");
  expect(keyText("Capture (Super+C), then Super+Shift+O", "mac")).toBe("Capture (Ctrl+Cmd+C), then Ctrl+Cmd+Shift+O");
  expect(appChord(parseChord("Ctrl+Alt+P")!, "windows")).toBe(true);
  expect(appChord(parseChord("Ctrl+Alt+P")!, "linux")).toBe(false);
});

test("AltGr types its character: it never runs a Ctrl+Alt shortcut", () => {
  const key = (altGr: boolean) => ({ code: "KeyE", key: altGr ? "€" : "e", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, getModifierState: (m: string) => altGr && m === "AltGraph" }) as unknown as KeyboardEvent;
  const chord = parseChord("Ctrl+Alt+E")!;
  expect(matches(chord, key(false))).toBe(true);
  expect(matches(chord, key(true))).toBe(false);
});

const UA = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

async function keyboardPage(browser: Browser, ua: string, baseURL: string) {
  const ctx = await browser.newContext({ userAgent: ua, baseURL });
  await ctx.addInitScript((mac) => Object.defineProperty(navigator, "platform", { get: () => (mac ? "MacIntel" : "Win32") }), ua.includes("Mac"));
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  return { ctx, page };
}

for (const [sys, ua] of Object.entries(UA)) {
  test(`on ${sys} the app keys open what they open on Linux, and no two commands share a key`, async ({ browser, baseURL }) => {
    const { ctx, page } = await keyboardPage(browser, ua, baseURL!);
    await page.keyboard.press(sys === "mac" ? "Control+Meta+Comma" : "Control+Alt+Comma"); // Super+, : Settings
    const nav = page.getByRole("navigation", { name: "Settings pages" });
    await nav.getByRole("button", { name: /^Keyboard/ }).click();
    const row = (id: string) => page.locator("li", { has: page.locator("code", { hasText: new RegExp(`^${id.replace(/\./g, "\\.")}$`) }) });
    await expect(row("ui.vault.next")).toContainText(sys === "mac" ? /Ctrl\s*Cmd\s*V/ : /Ctrl\s*Alt\s*V/);
    if (sys === "windows") await expect(row("ui.tabs.pin")).toContainText(/Ctrl\s*Alt\s*Shift\s*P/); // moved: Super+P took Ctrl+Alt+P
    await expect(page.locator("[data-clash]")).toHaveCount(0);
    await ctx.close();
  });
}
