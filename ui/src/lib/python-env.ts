// "Python: choose the environment": the vault's environments (its own .venv / venv, one folder down, conda's) in the
// chooser; the choice is `[lsp] python_env`, used by the Python server (restarted here) and new terminals.
import { api } from "./api";
import { pick, type PickItem } from "./palette.svelte";
import { updateSettings } from "./settings.svelte";
import { restartLanguage } from "./editor/lsp";
import { toast } from "./state.svelte";
import { errText } from "./text";

export async function choosePythonEnv(): Promise<void> {
  const envs = await api.pythonEnvs().catch((e) => { toast("Could not list the Python environments", errText(e), "error"); return null; });
  if (!envs) return;
  const mark = (on: boolean) => (on ? " · in use" : "");
  const items: PickItem[] = [
    { value: "", title: "Automatic", detail: `the vault's own .venv or venv${envs.setting === "" ? (envs.chosen ? ` (${envs.chosen})` : " (none here: the system's)") : ""}${mark(envs.setting === "")}` },
    ...envs.found.map((e) => ({ value: e.path, title: e.name, detail: `${e.kind} · ${e.python}${mark(envs.setting !== "" && envs.chosen === e.path)}`, section: "Found" })),
    { value: "none", title: "None: the system's Python", detail: mark(envs.setting === "none").replace(" · ", "") || undefined, section: "Without one" },
  ];
  pick({
    placeholder: "Python environment…", tag: "Python", icon: "terminal", items,
    onpick: async (value) => {
      await updateSettings((c) => { c.lsp.python_env = value; });
      await restartLanguage("python");
      toast("Python environment chosen", value === "" ? "Automatic: the vault's own, when it has one." : value === "none" ? "The system's Python." : `${value} — for the Python server and new terminals.`);
    },
  });
}
