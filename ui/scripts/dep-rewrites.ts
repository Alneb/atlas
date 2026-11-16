// Dependencies changed at build time, each in one checked spot (one mechanism for all of them): a rewrite whose code is
// gone from a newer release fails the build rather than silently restoring the old behaviour.
export interface DepRewrite { name: string; pkg: RegExp; at: RegExp; to: (m: string, ...g: string[]) => string; lost: string }
export const DEP_REWRITES: DepRewrite[] = [
  // Excalidraw draws every freehand stroke with fixed smoothing (perfect-freehand: thinning .6, smoothing .5,
  // streamline .5), which rounds handwriting off and makes the settled stroke differ from the Boox's quick line. This
  // spot asks `globalThis.__atlasInk(element)` first (lib/draw-ink.ts): a stroke the notepad's pen made gets crisp
  // settings, every other stroke Excalidraw's own.
  { name: "excalidraw-ink", pkg: /@excalidraw[\\/]excalidraw/,
    at: /size:\s*(\w+)\.strokeWidth\s*\*\s*4\.25,\s*thinning:\s*0?\.6,\s*smoothing:\s*0?\.5,\s*streamline:\s*0?\.5/,
    to: (_m, el) => `size:${el}.strokeWidth*4.25,...(globalThis.__atlasInk?.(${el})??{thinning:.6,smoothing:.5,streamline:.5})`,
    lost: "Excalidraw's freedraw options: the pen's crisp strokes would be lost" },
  // xterm blends dim text (SGR 2) halfway into the background and then asks it only half the minimum contrast, so on a
  // light background dim cells fall to 1.6–3:1. Dim text gets the full `minimumContrastRatio` (--term-contrast):
  // still lighter than normal text, never below the theme's bar. Both renderers (DOM in xterm, WebGL in its addon).
  { name: "xterm-dim", pkg: /@xterm[\\/]xterm[\\/]/, at: /minimumContrastRatio\/\([\w$]+\.isDim\(\)\?2:1\)/g, to: () => "minimumContrastRatio",
    lost: "xterm's dim contrast (minimumContrastRatio/(isDim?2:1)): dim terminal text would be faint again" },
  { name: "xterm-webgl-dim", pkg: /@xterm[\\/]addon-webgl/, at: /minimumContrastRatio\/\([\w$]+\?2:1\)/g, to: () => "minimumContrastRatio",
    lost: "the WebGL renderer's dim contrast (minimumContrastRatio/(dim?2:1)): dim terminal text would be faint again" },
];
/** The module rewritten by every rewrite meant for it; `hit` names the rewrites that found their spot. */
export function rewriteDeps(code: string, id: string): { code: string; hit: string[] } | null {
  const mine = DEP_REWRITES.filter((r) => r.pkg.test(id));
  if (!mine.length) return null;
  const hit: string[] = [];
  for (const r of mine) {
    const out = code.replace(r.at, r.to as (m: string, ...g: unknown[]) => string);
    if (out !== code) { hit.push(r.name); code = out; }
  }
  return hit.length ? { code, hit } : null;
}
