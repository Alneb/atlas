// Today: the day drawn — the greeting's chips and the vault's map and areas (home.js), the top of a day's log
// (daily.js) — with one language for both. Block ids keep their names (`daily.header`, `home.map`, `home.areas`): notes
// already use them.
import { registerDaily } from "./daily.js";
import { registerHome } from "./home.js";

export function register(atlas) {
  /** The setting's language, or this device's for `auto`. */
  const lang = () => { const l = String(atlas.plugin.settings.language ?? "auto"); return l === "auto" ? navigator.language : l; };
  registerDaily(atlas, lang);
  registerHome(atlas, lang);
}
