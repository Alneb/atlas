// Whether the properties panel is open beside notes, when the setting keeps properties hidden (`[editor] properties =
// "hidden"`, the default). The user, 2026-10-15: "properties only render as text not rich text, and i told you to move
// them to a right panel and hide them by default": the "Properties N" line opens this panel (rich controls), not the
// YAML. Remembered in this browser; `panel` in the setting keeps it always open.
import { load, save } from "./prefs";

const KEY = "atlas.propertiesPanel";
export const propsPanel = $state({ open: load<boolean>(KEY, false) });

export function toggleProperties(open = !propsPanel.open): void {
  propsPanel.open = open;
  save(KEY, open);
}

// the "Properties N" line in a note (lib/properties.ts propertiesChip) asks for it this way
if (typeof window !== "undefined") window.addEventListener("atlas-properties-toggle", () => toggleProperties());
