// The properties the vault's notes use and their commonest values (GET /api/properties/known, property_spec.rs `known`):
// what the properties panel completes from. Read once, again after half a minute when the panel asks.
import { api } from "./api";
import type { KnownProperty } from "./gen/KnownProperty";

export const known = $state<{ list: KnownProperty[] }>({ list: [] });
let at = 0;

export function loadKnown(): void {
  if (Date.now() - at < 30_000) return;
  at = Date.now();
  void api.knownProperties().then((l) => { known.list = l; }, () => { at = 0; });
}

/** A property's known values, the commonest first. */
export const valuesOf = (key: string): string[] => known.list.find((p) => p.key === key)?.values ?? [];
