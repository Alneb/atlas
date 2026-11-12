import type { Page } from "@playwright/test";

/** A page that draws each vault's own look (`[ui]` in its file), as with "This device: its own look" off: for specs
 *  that change the vault's look and expect the page to follow (by default the look is the device's: device-look.svelte.ts). */
export const vaultLook = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("atlas.device-look.v1", JSON.stringify({ own: false, ui: {}, seeded: true })));
