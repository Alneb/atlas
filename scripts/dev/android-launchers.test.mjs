// The phone's launcher entries for native plugins (android-launchers.mjs): read from plugin.toml, made into the
// manifest's activities, adaptive icons and the classes they name. Run by build-apk.sh before the APK is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKER, adaptiveIcon, entries, javaClasses, launcherOf, manifestFragment, withLaunchers } from "./android-launchers.mjs";

const TOML = `title = "Demo"
[android]
main = "org.example.Demo" # its class
launcher = { label = "Demo & Co", icon = "music", home = "demo:home" } # its own app
[[setting]]
key = "launcher"
`;

test("a launcher is read from [android] only", () => {
  assert.deepEqual(launcherOf(TOML), { label: "Demo & Co", icon: "music", home: "demo:home" });
  assert.equal(launcherOf(`[android]\nmain = "x"\n`), null);
  assert.equal(launcherOf(`[other]\nlauncher = { label = "L", icon = "music", home = "h" }\n`), null);
});

test("a malformed launcher fails the build", () => {
  assert.throws(() => launcherOf(`[android]\nlauncher = { label = "L", icon = "music" }\n`), /no home/);
  assert.throws(() => launcherOf(`[android]\nlauncher = { label = "L", icon = "Music-1", home = "h" }\n`), /icon names/);
});

test("each entry is an activity of its own: label, icon, task, launcher filter, the plugin and its place", () => {
  const f = manifestFragment([{ id: "my-plugin", label: "Demo & Co", icon: "music", home: "demo:home" }]);
  assert.match(f, /android:name="org\.atlas\.capture\.PluginLaunchers\$my_plugin"/);
  assert.match(f, /android:label="Demo &amp; Co"/);
  assert.match(f, /android:icon="@mipmap\/ic_plugin_my_plugin"/);
  assert.match(f, /android:taskAffinity="org\.atlas\.plugin\.my_plugin"/);
  assert.match(f, /android\.intent\.category\.LAUNCHER/);
  assert.match(f, /<meta-data android:name="org\.atlas\.plugin" android:value="my-plugin" \/>/);
  assert.match(f, /<meta-data android:name="org\.atlas\.path" android:value="demo:home" \/>/);
  assert.match(javaClasses([{ id: "my-plugin" }]), /public static final class my_plugin extends PluginActivity \{\}/);
  assert.match(adaptiveIcon({ label: "D", icon: "music" }), /@drawable\/ic_music/);
});

test("the fragment goes at the manifest's marker, which must be there once", () => {
  const m = `<application>\n    ${MARKER}\n</application>`;
  const out = withLaunchers(m, [{ id: "a", label: "A", icon: "music", home: "a:home" }]);
  assert.ok(out.indexOf("PluginLaunchers$a") > out.indexOf(MARKER) && out.indexOf("PluginLaunchers$a") < out.indexOf("</application>"));
  assert.equal(withLaunchers(m, []), m);
  assert.throws(() => withLaunchers("<application/>", []), /exactly once/);
});

test("this repo's launchers: Audiobookshelf and Manga, each on its own home place", async () => {
  const all = Object.fromEntries((await entries()).map((e) => [e.id, e]));
  assert.equal(all.audiobookshelf?.home, "audiobookshelf:home");
  assert.equal(all.manga?.home, "manga:library");
});
