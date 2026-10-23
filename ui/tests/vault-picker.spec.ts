import { test, expect } from "@playwright/test";

// The desktop's vault picker connects to a server too. Nothing is opened here: an
// open starts a window of the desktop app and writes the user's vault list.
test("the vault picker offers a server, and asks for its address", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Alt+v");
  await page.getByTestId("vault-switcher").getByRole("button", { name: "Connect to a server…" }).click();
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toHaveAttribute("placeholder", /server's address/);
  await page.keyboard.type("https://atlas.example.org/v/notes/");
  await expect(palette.getByText("Connect to https://atlas.example.org/v/notes/")).toBeVisible();
  await page.keyboard.press("Escape");
});
