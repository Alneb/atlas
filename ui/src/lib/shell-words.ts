// A command's words as a terminal's shell reads them back (`atlas.terminal.quote` / `line`): POSIX shells, PowerShell
// and cmd quote differently, so a plugin typing a command into the terminal asks `atlas.terminal.shell()` once and
// quotes for that. Pure.

export type ShellKind = "posix" | "powershell" | "cmd";

/** One argument, as `shell` reads it back unchanged; one with nothing to protect stays as it is (readable). */
export function quote(arg: string, shell: ShellKind = "posix"): string {
  const s = String(arg);
  if (/^[\w./:=@%+,-]+$/.test(s)) return s;
  if (shell === "powershell") return `'${s.replace(/'/g, "''")}'`;
  if (shell === "cmd") return `"${s.replace(/"/g, '""')}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** A program and its arguments as one command line; PowerShell runs a quoted program only after `&`. */
export function line(shell: ShellKind, program: string, ...args: (string | undefined)[]): string {
  const p = quote(program, shell);
  return [shell === "powershell" && p !== program ? `& ${p}` : p, ...args.filter((a): a is string => a !== undefined).map((a) => quote(a, shell))].join(" ");
}
