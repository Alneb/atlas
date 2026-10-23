// Reading a V8 .cpuprofile: self time per function (by name and file), shared by the profilers here.

/** The top `n` functions by self time, one line each. */
export function hot(profile, n = 12) {
  const self = new Map(), byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const dt = profile.timeDeltas, samples = profile.samples;
  for (let i = 0; i < samples.length; i++) {
    const f = byId.get(samples[i]).callFrame;
    const k = ["(idle)", "(program)", "(garbage collector)"].includes(f.functionName) && !f.url
      ? f.functionName
      : `${f.functionName || "(anonymous)"}  ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0));
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `  ${(us / 1000).toFixed(1).padStart(8)} ms  ${k}`).join("\n");
}
