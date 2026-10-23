// The audit's workspace: a copy of the note folders (and their attachments) of the source workspace,
// plus its UI/editor config, so rendering is judged on real notes without ever writing to them.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIRS = (process.env.ATLAS_AUDIT_DIRS ?? "notes,log").split(",").filter(Boolean);

export function buildSample(src: string, dst: string): void {
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(join(dst, ".atlas"), { recursive: true });
  for (const d of DIRS) if (existsSync(join(src, d))) cpSync(join(src, d), join(dst, d), { recursive: true });
  for (const f of ["FOCUS.md", "README.md"]) if (existsSync(join(src, f))) cpSync(join(src, f), join(dst, f));
  // keep only the sections that change how notes look; tool paths and terminals are irrelevant here
  const cfg = existsSync(join(src, ".atlas/config.toml")) ? readFileSync(join(src, ".atlas/config.toml"), "utf8") : "";
  const keep = cfg.split(/^(?=\[)/m).filter((s) => !s.startsWith("[") || /^\[(ui|editor)\]/.test(s));
  writeFileSync(join(dst, ".atlas/config.toml"), keep.join(""));
}
