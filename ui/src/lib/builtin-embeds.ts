// The core's own embeds, registered through the same registry as a plugin's (embed-registry.ts): moving one into a
// plugin (Excalidraw into the notepad plugin, docs/refactor/REFACTOR-core-to-plugins.md) is moving its line.
import { registerEmbed } from "./embed-registry";
import { drawingEmbed } from "./draw-embed";

registerEmbed("core", ["excalidraw", "excalidraw.md"], drawingEmbed);
