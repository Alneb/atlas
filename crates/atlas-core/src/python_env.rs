//! The Python environment the vault's code runs in (`[lsp] python_env`): the Python language server and new terminals
//! start with it first on `PATH` (and `VIRTUAL_ENV` / `CONDA_PREFIX` set), so imports resolve against its packages.
//! Empty = the vault's own `.venv` or `venv` when it has one (as VS Code picks it); `none` = the system's Python.
use crate::api::{PythonEnv, PythonEnvKind, PythonEnvs};
use crate::config::Config;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// The folders a vault keeps its own environment in, in the order they are preferred.
const OWN: [&str; 4] = [".venv", "venv", "env", ".env"];

/// `bin` (Unix) or `Scripts` (Windows): where an environment keeps `python`.
fn bin_dir(env: &Path) -> PathBuf {
    if cfg!(windows) && env.join("Scripts").is_dir() {
        env.join("Scripts")
    } else {
        env.join("bin")
    }
}

fn python_in(env: &Path) -> Option<PathBuf> {
    let bin = bin_dir(env);
    ["python3", "python", "python.exe"].iter().map(|n| bin.join(n)).find(|p| p.is_file())
}

fn kind_of(env: &Path) -> Option<PythonEnvKind> {
    python_in(env)?;
    if env.join("pyvenv.cfg").is_file() {
        Some(PythonEnvKind::Venv)
    } else if env.join("conda-meta").is_dir() {
        Some(PythonEnvKind::Conda)
    } else {
        None
    }
}

fn entry(env: &Path, name: String) -> Option<PythonEnv> {
    let kind = kind_of(env)?;
    Some(PythonEnv { path: env.to_string_lossy().into_owned(), python: python_in(env)?.to_string_lossy().into_owned(), name, kind })
}

/// The environments at hand: the vault's own (at its top, and one folder down: `project/.venv`), then conda's.
pub fn found(root: &Path) -> Vec<PythonEnv> {
    let mut out = Vec::new();
    let mut look = |dir: &Path, label: &str| {
        for own in OWN {
            if let Some(e) = entry(&dir.join(own), if label.is_empty() { own.to_string() } else { format!("{label}/{own}") }) {
                out.push(e);
            }
        }
    };
    look(root, "");
    let mut subs: Vec<PathBuf> = std::fs::read_dir(root).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    subs.sort();
    for d in subs {
        let name = d.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if !name.starts_with('.') {
            look(&d, &name);
        }
    }
    if let Some(home) = crate::platform::dirs::home() {
        for base in ["miniconda3", "anaconda3", "miniforge3", "mambaforge", ".conda"] {
            let base = home.join(base);
            if let Some(e) = entry(&base, format!("conda base ({})", base.file_name().unwrap_or_default().to_string_lossy())) {
                out.push(e);
            }
            let mut envs: Vec<PathBuf> = std::fs::read_dir(base.join("envs")).into_iter().flatten().flatten().map(|e| e.path()).collect();
            envs.sort();
            out.extend(envs.iter().filter_map(|e| entry(e, format!("conda: {}", e.file_name().unwrap_or_default().to_string_lossy()))));
        }
    }
    out
}

/// The environment in use: the setting's folder (relative to the vault, absolute, or `~/…`), else the vault's own.
pub fn chosen(cfg: &Config, root: &Path) -> Option<PathBuf> {
    let set = cfg.lsp.python_env.trim();
    match set {
        "none" => None,
        "" => OWN.iter().map(|o| root.join(o)).find(|e| kind_of(e).is_some()),
        p => {
            let p = crate::platform::dirs::expand_tilde(p);
            let p = if p.is_absolute() { p } else { root.join(p) };
            kind_of(&p).map(|_| p)
        }
    }
}

/// The variables a process gets to run in `env`: its `bin` first on `PATH`, and the variable tools read to know it.
pub fn vars(env: &Path) -> Vec<(String, OsString)> {
    let mut path = vec![bin_dir(env)];
    path.extend(std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect::<Vec<_>>()).unwrap_or_default());
    let joined = std::env::join_paths(path).unwrap_or_default();
    let marker = if env.join("conda-meta").is_dir() { "CONDA_PREFIX" } else { "VIRTUAL_ENV" };
    vec![("PATH".into(), joined), (marker.into(), env.as_os_str().to_owned())]
}

/// `GET /api/python-envs`.
pub fn list(cfg: &Config, root: &Path) -> PythonEnvs {
    PythonEnvs { setting: cfg.lsp.python_env.clone(), chosen: chosen(cfg, root).map(|p| p.to_string_lossy().into_owned()), found: found(root) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn venv(dir: &Path) {
        std::fs::create_dir_all(bin_dir(dir)).unwrap();
        std::fs::write(bin_dir(dir).join("python3"), "").unwrap();
        std::fs::write(dir.join("pyvenv.cfg"), "home = /usr/bin\n").unwrap();
    }

    #[test]
    fn the_vaults_own_environment_is_found_and_chosen_unless_the_setting_says_otherwise() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        venv(&root.join(".venv"));
        venv(&root.join("sim/venv"));
        std::fs::create_dir_all(root.join("notvenv/bin")).unwrap(); // no pyvenv.cfg, no python: not one
        let names: Vec<String> = found(root).into_iter().filter(|e| e.path.starts_with(&*root.to_string_lossy())).map(|e| e.name).collect();
        assert_eq!(names, [".venv", "sim/venv"]);
        let mut cfg = Config::default();
        assert_eq!(chosen(&cfg, root), Some(root.join(".venv")), "empty: the vault's own");
        cfg.lsp.python_env = "sim/venv".into();
        assert_eq!(chosen(&cfg, root), Some(root.join("sim/venv")));
        cfg.lsp.python_env = "none".into();
        assert_eq!(chosen(&cfg, root), None);
        cfg.lsp.python_env = "missing".into();
        assert_eq!(chosen(&cfg, root), None, "a folder that is no environment: none");
        let v = vars(&root.join(".venv"));
        assert!(std::env::split_paths(&v[0].1).next() == Some(bin_dir(&root.join(".venv"))), "its bin first on PATH");
        assert_eq!(v[1], ("VIRTUAL_ENV".to_string(), root.join(".venv").into_os_string()));
    }
}
