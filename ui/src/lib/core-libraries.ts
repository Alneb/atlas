// The core's own libraries, registered as a plugin's are (`registerLibrary`, the call behind `atlas.registerLibrary`):
// every drawing (library-drawings.ts), and References (library-references.ts, the papers of catalog-papers) while the
// built-in Library is on. The page that shows them is a plugin's (libraries.svelte.ts); each source loads when first shown.
import { registerLibrary } from "./libraries.svelte";
import { builtinOn } from "./builtin-plugins";

registerLibrary({ id: "drawings", title: "Drawings", icon: "edit", by: "core", source: () => import("./library-drawings").then((m) => m.drawingsSource()) });
registerLibrary({ id: "references", title: "References", icon: "library", by: "library", when: () => builtinOn("library"), source: () => import("./library-references").then((m) => m.referencesSource()) });
