import { test, expect } from "@playwright/test";

// The terminal answers "what is your background?" (OSC 11), as Claude Code's theme "auto" asks:
// in the light theme the answer is light, so Claude draws its light palette.
test("the terminal tells programs its background colour (OSC 11)", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm")).toBeVisible();
  await pane.locator(".xterm").click();
  // ask on the tty in raw mode, print the answer's colour
  const ask = `python3 -c "import os,tty,termios,select;fd=os.open('/dev/tty',os.O_RDWR);o=termios.tcgetattr(fd);tty.setraw(fd);os.write(fd,b'\\x1b]11;?\\x07');select.select([fd],[],[],3);r=os.read(fd,64);termios.tcsetattr(fd,termios.TCSADRAIN,o);print('BG=',r[5:19].decode())"`;
  await page.keyboard.type(ask);
  await page.keyboard.press("Enter");
  await expect(pane.locator(".xterm-rows")).toContainText(/BG= rgb:[ef][0-9a-f]{3}\//i, { timeout: 10_000 });
});

// Mode 2031: a program that sets it is told when the theme flips (`CSI ? 997 ; 2 n` = light), and asks OSC 11
// again — Claude Code 2.1.30x re-reads the background only then.
test("the terminal tells a program that asked (mode 2031) when the theme flips", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm")).toBeVisible();
  await pane.locator(".xterm").click();
  // set the mode, say RRRRRRR (not in the typed line), wait for the push, print it
  const ask = `python3 -c "import os,tty,termios,select;fd=os.open('/dev/tty',os.O_RDWR);o=termios.tcgetattr(fd);tty.setraw(fd);os.write(fd,b'\\x1b[?2031h'+b'R'*7+b'\\r\\n');select.select([fd],[],[],8);r=os.read(fd,64);os.write(fd,b'\\x1b[?2031l');termios.tcsetattr(fd,termios.TCSADRAIN,o);print('PUSH=',r[2:].decode())"`;
  await page.keyboard.type(ask);
  await page.keyboard.press("Enter");
  await expect(pane.locator(".xterm-rows")).toContainText("RRRRRRR", { timeout: 10_000 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await expect(pane.locator(".xterm-rows")).toContainText("PUSH= ?997;2n", { timeout: 10_000 });
});
