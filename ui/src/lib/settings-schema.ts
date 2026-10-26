// Reading the config's JSON schema (schemars; Rust doc comments → descriptions) for Settings.
import { errText } from "./text";
import { settings, updateSettings } from "./settings.svelte";
import { toast } from "./state.svelte";
import type { SettingsHost } from "./settings-pages";

export type Schema = {
  $ref?: string; type?: string | string[]; description?: string; properties?: Record<string, Schema>;
  enum?: string[]; oneOf?: Schema[]; const?: string; minimum?: number; maximum?: number; items?: Schema;
  format?: string;
  /** What Settings shows, from the core (settings_layout.rs): the label, the choices' labels, the clients it does
   *  something on (absent: all). */
  title?: string; "x-labels"?: Record<string, string>; "x-hosts"?: SettingsHost[];
};
export type Opt = { value: string; note?: string };

const defs = () => ((settings.schema as { $defs?: Record<string, Schema> } | null)?.$defs) ?? {};

export function resolve(s: Schema): Schema {
  if (!s.$ref) return s;
  const def = defs()[s.$ref.split("/").pop() ?? ""] ?? {};
  return { ...def, ...s, $ref: undefined, description: s.description ?? def.description };
}

export function options(s: Schema): Opt[] | null {
  if (s.enum) return s.enum.map((value) => ({ value }));
  if (!s.oneOf) return null;
  return s.oneOf.flatMap((o) => (o.enum ? o.enum.map((value) => ({ value })) : o.const !== undefined ? [{ value: o.const, note: o.description }] : []));
}

/** Every leaf setting as a dotted path → its resolved schema, in schema order. */
export function leaves(): Map<string, Schema> {
  const out = new Map<string, Schema>();
  const walk = (props: Record<string, Schema>, pre: string) => {
    for (const [k, raw] of Object.entries(props)) {
      const s = resolve(raw);
      if (s.properties) walk(s.properties, `${pre}${k}.`);
      else out.set(`${pre}${k}`, s);
    }
  };
  walk(resolve((settings.schema as Schema | null) ?? {}).properties ?? {}, "");
  return out;
}

/** A setting's label (the core's), else its key. */
export const fieldTitle = (path: string): string => leaves().get(path)?.title ?? path.split(".").pop() ?? path;
/** A section's label (the core's), else its key. */
export function sectionTitle(sec: string): string {
  const raw = resolve((settings.schema as Schema | null) ?? {}).properties?.[sec];
  return raw?.title ?? sec;
}
/** A choice's label (the core's), else the value itself. */
export const choiceLabel = (s: Schema, value: string): string => s["x-labels"]?.[value] ?? value;
/** Whether a setting does something where Settings runs. */
export const shownOn = (s: Schema, host: SettingsHost): boolean => !s["x-hosts"] || s["x-hosts"].includes(host);

/** A section's description (`ui` → "Appearance."), for search. */
export function sectionDescription(sec: string): string {
  const raw = resolve((settings.schema as Schema | null) ?? {}).properties?.[sec];
  return raw ? resolve(raw).description ?? "" : "";
}

export const plain = (d?: string) => (d ?? "").replace(/`([^`]+)`/g, "$1").replace(/\.$/, "");

function at(root: unknown, path: string): unknown {
  let v = root;
  for (const k of path.split(".")) v = (v as Record<string, unknown> | null)?.[k];
  return v;
}
export const valueOf = (path: string) => at(settings.config, path);
export const defaultOf = (path: string) => at(settings.defaults, path);
export const isModified = (path: string) => settings.defaults !== null && JSON.stringify(valueOf(path)) !== JSON.stringify(defaultOf(path));

function put(root: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  let o = root as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

async function save(label: string, mut: Parameters<typeof updateSettings>[0]): Promise<void> {
  try {
    await updateSettings(mut);
  } catch (err) {
    toast(`${label} not saved`, errText(err), "error");
  }
}

export const setValue = (path: string, value: unknown) => save("Setting", (c) => put(c, path, value));
export const resetValue = (path: string) => setValue(path, JSON.parse(JSON.stringify(defaultOf(path) ?? null)));

// Zoom: the four text sizes move together, each inside its schema range (config.rs `#[schemars(range)]`).
const SIZES = ["ui.font_size", "editor.code_font_size", "editor.prose_font_size", "terminal.font_size"];
/** `step` px larger or smaller; 0 = back to the default sizes. */
export const zoom = (step: -1 | 0 | 1) => save("Zoom", (c) => {
  const ranges = leaves();
  for (const p of SIZES) {
    const { minimum = -Infinity, maximum = Infinity } = ranges.get(p) ?? {};
    const n = step === 0 ? defaultOf(p) : Math.min(maximum, Math.max(minimum, (at(c, p) as number) + step));
    if (typeof n === "number") put(c, p, n);
  }
});
