// Reading the config's JSON schema (schemars; Rust doc comments → descriptions) for Settings.
import { errText } from "./text";
import { settings, updateSettings } from "./settings.svelte";
import { toast } from "./state.svelte";

export type Schema = {
  $ref?: string; type?: string | string[]; description?: string; properties?: Record<string, Schema>;
  enum?: string[]; oneOf?: Schema[]; const?: string; minimum?: number; maximum?: number; items?: Schema;
  format?: string;
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

export async function setValue(path: string, value: unknown): Promise<void> {
  try {
    await updateSettings((c) => {
      const keys = path.split(".");
      let o = c as unknown as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
      o[keys[keys.length - 1]] = value;
    });
  } catch (err) {
    toast("Setting not saved", errText(err), "error");
  }
}
export const resetValue = (path: string) => setValue(path, JSON.parse(JSON.stringify(defaultOf(path) ?? null)));
