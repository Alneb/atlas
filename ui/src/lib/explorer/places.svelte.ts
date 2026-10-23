// The explorer's Places column: each source's places (the vault's folders, SSH hosts, copyparty servers), filled group by
// group as each source answers — one that hangs (a server down) leaves the others shown; waiting for all of them at once
// left the whole column blank.
import { why, type FileSource, type Place } from "../file-sources.svelte";
import type { Loc } from "./browse.svelte";

export type PlaceGroup = { src: FileSource; list: Place[]; error?: string; loading?: boolean };
const WAIT_MS = 15_000;

export class PlaceGroups {
  groups = $state<PlaceGroup[]>([]);
  #run = 0;

  async load(sources: FileSource[]): Promise<void> {
    const run = ++this.#run;
    const old = new Map(this.groups.map((g) => [g.src.id, g]));
    this.groups = sources.map((s) => ({ src: s, list: old.get(s.id)?.list ?? [], loading: !old.has(s.id) }));
    await Promise.all(sources.map(async (s) => {
      let group: PlaceGroup;
      try {
        const list = await Promise.race([s.places(), new Promise<never>((_, no) => setTimeout(() => no(new Error("not answering")), WAIT_MS))]);
        group = { src: s, list };
      } catch (e) { group = { src: s, list: [], error: why(e) }; }
      if (run === this.#run) this.groups = this.groups.map((g) => (g.src.id === s.id ? group : g));
    }));
  }

  /** Loads now and again whenever a source says its places changed (a host connected) → stop watching. */
  watch(sources: FileSource[]): () => void {
    const offs = sources.map((s) => s.onPlaces?.(() => void this.load(sources)) ?? (() => {}));
    void this.load(sources);
    return () => offs.forEach((f) => f());
  }

  place(loc: Loc): Place | undefined {
    return this.groups.find((g) => g.src.id === loc.source)?.list.find((p) => p.id === loc.place);
  }

  /** It answered: connected, whatever the last look at the places said. */
  markUp(loc: Loc): void {
    const p = this.place(loc);
    if (p) p.up = true;
  }
}
