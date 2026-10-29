// SPDX-License-Identifier: MIT OR Apache-2.0
// Node tests for a JS helper (scripts/dev/plugin-ui.mjs runs each plugin's helper/*.test.ts): the real prelude.js on a
// fake core, so a test drives the helper through the same protocol the core does.
//   import { harness, Reply } from "atlas-helper/testing";
//   import "./helper";                                   // registers its methods
//   harness.web = (url) => (url.includes("forecast") ? FORECAST : null);
//   const w = await harness.call("now", { settings: { place: "Oslo" } });
import { state, Reply, Status, type Answer } from "./testing-host";
import "./prelude.js";
import type { ExecResult, FetchRequest } from "./atlas-helper";

export { Reply, Status };

let next = 0;

export const harness = {
  /** The web: the answer for each fetched address (null: a 404). */
  set web(fn: (url: string, req: FetchRequest) => Answer | Promise<Answer>) { state.web = fn as typeof state.web; },
  /** The core's API (`atlas.get/post/put`, files, today…): the JSON answer, or throw `new Status(code, why)`. */
  set api(fn: (verb: string, path: string, body: any) => unknown) { state.api = fn; },
  /** The vault's zip files for `atlas.zip`: path → entry name → its text. */
  set zips(z: Record<string, Record<string, string>>) { state.zips = z; },
  /** `atlas.exec`: the result for each run (throw to refuse it). */
  set exec(fn: (program: string, args: string[], opts: { stdin?: string; cwd?: string; timeout?: number; locale?: "C" }) => ExecResult | Promise<ExecResult>) { state.exec = fn as typeof state.exec; },
  /** The `atlas.exec` runs asked, in order. */
  get ran() { return state.ran; },
  /** The fetch requests made, in order. */
  get asked() { return state.asked; },
  get events() { return state.events; },
  get logs() { return state.logs; },
  /** Calls a method as the core does; its answer, or its error. */
  call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++next;
    return new Promise<T>((resolve, reject) => {
      state.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      (globalThis as any).__atlas_receive(JSON.stringify({ id, method, params }));
    });
  },
  /** Forgets what was asked, sent and logged. */
  reset() {
    state.asked.length = 0;
    state.ran.length = 0;
    state.events.length = 0;
    state.logs.length = 0;
  },
};
