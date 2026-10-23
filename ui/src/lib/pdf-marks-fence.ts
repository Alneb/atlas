// The core's own fence: a PDF note's ```pdf-marks``` block drawn as its marks (components/PdfMarksNote.svelte) in live
// preview and the reading view, the lines staying the store. Loaded on the first such block.
import { mount, unmount, type Component } from "svelte";
import { registerFence } from "./fences";

registerFence("atlas", "pdf-marks", (host, fence) => {
  let app: ReturnType<typeof mount> | undefined, gone = false;
  void import("../components/PdfMarksNote.svelte").then((m) => {
    if (!gone) app = mount(m.default as Component<{ source: string; note: string }>, { target: host, props: { source: fence.source, note: fence.path } });
  });
  return () => { gone = true; if (app) void unmount(app); };
});
