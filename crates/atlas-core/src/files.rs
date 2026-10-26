//! Tree listing and text/raw file IO for the editor panes.
use crate::api::{EntryKind, FileText, FileWrite, FileWritten, Mtime, TreeEntry};
use crate::{Error, Result, Workspace};
use crate::vault_write;

/// A save writes beside the file as `.<name>.atlas-tmp-<pid>-<nanos>` and renames it into place.
pub(crate) const WRITE_TMP: &str = ".atlas-tmp-";
/// Is this path such a temporary file? (They live for a moment; lists of the user's files skip them.)
pub fn is_write_tmp(rel: &str) -> bool {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    name.starts_with('.') && name.contains(WRITE_TMP)
}

pub const MAX_TEXT_BYTES: u64 = 5 * 1024 * 1024;
/// A drawing keeps its pictures inside (Excalidraw's `files`, as data URLs): a page of pasted photos or scanned
/// pages passes 20 MB (seen: 60 pictures, 22.9 MB), and its pane loads it whole anyway.
pub const MAX_DRAWING_BYTES: u64 = 128 * 1024 * 1024;

/// How large a text file may be read or written through `/api/file`: a note is opened in the editor (5 MB),
/// a drawing in its own pane.
pub fn text_limit(rel: &str) -> u64 {
    if rel.ends_with(".excalidraw") || rel.ends_with(".excalidraw.md") || rel.ends_with(".excalidraw.json") {
        MAX_DRAWING_BYTES
    } else {
        MAX_TEXT_BYTES
    }
}

/// Whether the note at `path` says `shown: false` in its frontmatter (its first 4 KB: a companion's properties are few).
fn unshown(path: &std::path::Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 4096];
    let n = std::fs::File::open(path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    let text = String::from_utf8_lossy(&head[..n]);
    let Some(fm) = atlas_text::frontmatter::yaml_head(&text) else { return false };
    fm.lines().any(|l| l.trim_end() == "shown: false")
}

/// One directory level, dirs first then by name. Ignored and hidden entries per `[files]` config; `all_hidden`: the
/// dotfiles too (the explorers' "Show hidden files", which then hide them by the same rule in the UI).
pub fn tree(ws: &Workspace, rel: &str, all_hidden: bool) -> Result<Vec<TreeEntry>> {
    let cfg = ws.config()?;
    let dir = ws.resolve(rel)?;
    if !dir.is_dir() {
        return Err(Error::NotFound(rel.into()));
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let hidden = name.starts_with('.') && name != ".atlas";
        if name == ".git" || is_write_tmp(&name) || (hidden && !cfg.files.show_hidden && !all_hidden) {
            continue;
        }
        let path = ws.rel(&entry.path());
        let ignored = cfg.is_ignored(&path);
        if ignored && !cfg.files.show_ignored {
            continue;
        }
        // metadata() follows symlinks, so a link to a dir lists as a dir.
        let Ok(meta) = entry.path().metadata() else { continue }; // dangling symlink
        let kind = if meta.is_dir() { EntryKind::Dir } else { EntryKind::File };
        let size = (kind == EntryKind::File).then_some(meta.len());
        let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64);
        let note = (kind == EntryKind::Dir)
            .then(|| format!("{path}/{}", crate::companion::file_name(&name)))
            .filter(|n| ws.resolve(n).is_ok_and(|p| p.is_file()));
        let unshown = kind == EntryKind::File && name.ends_with(".md") && unshown(&entry.path());
        out.push(TreeEntry { name, path, kind, ignored, size, modified, note, unshown });
    }
    out.sort_by(|a, b| {
        (a.kind != EntryKind::Dir, a.name.to_lowercase()).cmp(&(b.kind != EntryKind::Dir, b.name.to_lowercase()))
    });
    Ok(out)
}

pub fn read_text(ws: &Workspace, rel: &str) -> Result<FileText> {
    let path = ws.resolve(rel)?;
    let meta = std::fs::metadata(&path).map_err(|_| Error::NotFound(rel.into()))?;
    if meta.is_dir() {
        return Err(Error::BadRequest(format!("{rel} is a directory")));
    }
    let limit = text_limit(rel);
    if meta.len() > limit {
        return Err(Error::TooLarge(format!("{rel} is {} bytes (limit {limit})", meta.len())));
    }
    let text = String::from_utf8(std::fs::read(&path)?).map_err(|_| Error::NotText(rel.into()))?;
    Ok(FileText { path: ws.rel(&path), text, mtime: Mtime::of(&meta)? })
}

/// Atomic (tmp + rename) write. With `base_mtime`, refuses to clobber a file changed since it was
/// read — including one deleted meanwhile.
pub fn write_text(ws: &Workspace, req: &FileWrite) -> Result<FileWritten> {
    let guard = match (req.base_mtime, req.only_new) {
        (Some(_), true) => return Err(Error::BadRequest("base_mtime and only_new together".into())),
        (Some(m), false) => Guard::Mtime(m),
        (None, true) => Guard::OnlyNew,
        (None, false) => Guard::None,
    };
    let limit = text_limit(&req.path);
    if req.text.len() as u64 > limit {
        return Err(Error::TooLarge(format!("{} would be {} bytes (limit {limit})", req.path, req.text.len())));
    }
    write_bytes(ws, &req.path, req.text.as_bytes(), guard)
}

/// What a write checks before it replaces the file.
#[derive(Debug, Clone, Copy)]
pub enum Guard {
    /// Write whatever is there.
    None,
    /// Only if the file is still at the mtime the client read (else 409).
    Mtime(Mtime),
    /// Only if there is no such file; an existing one is kept (`written: false`). Atomic: the new file is linked into
    /// place, which fails when the name is taken, so two writers never both "create" it.
    OnlyNew,
}

/// Where the untouched original of a binary file is kept before its first overwrite.
pub const ORIGINALS_DIR: &str = ".atlas/originals";

/// Binary write (annotated PDFs). Before the first overwrite of a file, its original is kept under
/// `.atlas/originals/<rel>` — a hard link when possible, so it costs no space.
pub fn write_raw(ws: &Workspace, rel: &str, bytes: &[u8], base_mtime: Option<Mtime>) -> Result<FileWritten> {
    let path = ws.resolve(rel)?;
    if path.is_file() {
        let keep = ws.root().join(ORIGINALS_DIR).join(rel);
        if !keep.exists() {
            vault_write::link_or_copy(&path, &keep)?;
        }
    }
    write_bytes(ws, rel, bytes, base_mtime.map_or(Guard::None, Guard::Mtime))
}

fn write_bytes(ws: &Workspace, rel: &str, bytes: &[u8], guard: Guard) -> Result<FileWritten> {
    let path = ws.resolve(rel)?;
    if path == ws.root() || path.is_dir() {
        return Err(Error::BadRequest(format!("{rel} is a directory")));
    }
    let existing = std::fs::metadata(&path).ok();
    match guard {
        Guard::None => {}
        Guard::Mtime(base) => {
            let current = existing.as_ref().map(Mtime::of).transpose()?;
            if current != Some(base) {
                return Err(Error::Conflict { current });
            }
        }
        Guard::OnlyNew => {
            if let Some(meta) = &existing {
                return Ok(FileWritten { mtime: Mtime::of(meta)?, written: false, template: None });
            }
        }
    }
    let written = match guard {
        Guard::OnlyNew => vault_write::create(&path, bytes)? == vault_write::Created::New,
        Guard::None | Guard::Mtime(_) => {
            vault_write::write(&path, bytes)?;
            true
        }
    };
    Ok(FileWritten { mtime: Mtime::of(&std::fs::metadata(&path)?)?, written, template: None })
}


/// Bytes `start..=end` of a raw file (an HTTP `Range`), the file's length and its type: a PDF viewer reads
/// a 70 MB book by pieces instead of waiting for all of it. `end` is clamped to the file.
pub fn read_raw_range(ws: &Workspace, rel: &str, start: u64, end: u64) -> Result<(Vec<u8>, u64, String)> {
    use std::io::{Read, Seek, SeekFrom};
    let path = ws.resolve(rel)?;
    if !path.is_file() {
        return Err(Error::NotFound(rel.into()));
    }
    let mime = mime_guess::from_path(&path).first_or_octet_stream().essence_str().to_string();
    let mut f = std::fs::File::open(&path)?;
    let len = f.metadata()?.len();
    let end = end.min(len.saturating_sub(1));
    if start > end {
        return Err(Error::BadRequest(format!("range {start}-{end} outside a file of {len} bytes")));
    }
    f.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0; (end - start + 1) as usize];
    f.read_exact(&mut buf)?;
    Ok((buf, len, mime))
}

/// Saves a pasted/dropped file for `note` under `<note dir>/<attachment_folder>/`, never
/// overwriting: an existing name gets ` 1`, ` 2`… like Obsidian. Names are reduced to a safe
/// single path component.
pub fn attach(ws: &Workspace, note: &str, name: &str, bytes: &[u8]) -> Result<crate::api::Attached> {
    let folder = ws.config()?.editor.attachment_folder;
    let note_dir = note.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
    let rel_dir =
        [note_dir, folder.trim_matches('/')].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join("/");
    let clean: String = name.chars().map(|c| if c == '/' || c == '\\' || c.is_control() { '_' } else { c }).collect();
    let clean = clean.trim().trim_start_matches('.').to_string();
    if clean.is_empty() {
        return Err(Error::BadRequest("empty file name".into()));
    }
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (clean.clone(), String::new()),
    };
    let dir = ws.resolve(if rel_dir.is_empty() { "." } else { &rel_dir })?;
    let mut file = clean.clone();
    let mut n = 1;
    while dir.join(&file).exists() {
        file = format!("{stem} {n}{ext}");
        n += 1;
    }
    vault_write::write(&dir.join(&file), bytes)?;
    let path = if rel_dir.is_empty() { file.clone() } else { format!("{rel_dir}/{file}") };
    Ok(crate::api::Attached { embed: format!("![[{file}]]"), path })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_save_in_flight_is_recognised_and_a_users_dotfile_is_not() {
        assert!(is_write_tmp(".atlas/.bookmarks.yaml.atlas-tmp-3410544-1791934156284501517"));
        assert!(is_write_tmp(".note.md.atlas-tmp-1-2"));
        assert!(!is_write_tmp("notes/atlas-tmp-ideas.md"));
        assert!(!is_write_tmp(".gitignore"));
    }

    fn ws() -> (tempfile::TempDir, Workspace) {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::create_dir_all(root.join(".atlas")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("runs/big")).unwrap();
        std::fs::write(root.join("b.md"), "b").unwrap();
        std::fs::write(root.join("A.md"), "a").unwrap();
        std::fs::write(root.join(".hidden"), "h").unwrap();
        let w = Workspace::open(root).unwrap();
        (d, w)
    }

    #[test]
    fn a_drawing_with_its_pictures_may_be_larger_than_a_note() {
        let (d, w) = ws();
        let big = format!("{{\"files\":\"{}\"}}", "x".repeat(MAX_TEXT_BYTES as usize + 10));
        std::fs::write(d.path().join("notes/page.excalidraw"), &big).unwrap();
        std::fs::write(d.path().join("notes/huge.md"), &big).unwrap();
        assert_eq!(read_text(&w, "notes/page.excalidraw").unwrap().text.len(), big.len(), "the 22.9 MB drawing of 2026-10-18");
        assert!(matches!(read_text(&w, "notes/huge.md"), Err(Error::TooLarge(_))), "a note keeps the editor's limit");
        let save = |path: &str| write_text(&w, &FileWrite { path: path.into(), text: big.clone(), base_mtime: None, only_new: false, apply_here: false });
        assert!(save("notes/page2.excalidraw").is_ok());
        assert!(matches!(save("notes/huge2.md"), Err(Error::TooLarge(_))));
    }

    #[test]
    fn a_range_of_a_raw_file_is_read_by_itself_and_clamped_to_the_file() {
        let (d, w) = ws();
        std::fs::write(d.path().join("book.pdf"), b"0123456789").unwrap();
        let (b, len, mime) = read_raw_range(&w, "book.pdf", 2, 5).unwrap();
        assert_eq!((b.as_slice(), len, mime.as_str()), (&b"2345"[..], 10, "application/pdf"));
        assert_eq!(read_raw_range(&w, "book.pdf", 7, u64::MAX).unwrap().0, b"789"); // `bytes=7-`
        assert!(read_raw_range(&w, "book.pdf", 12, 20).is_err());
        assert!(read_raw_range(&w, "missing.pdf", 0, 1).is_err());
    }

    #[test]
    fn attach_saves_beside_the_note_without_overwriting() {
        let (_d, w) = ws();
        let a = attach(&w, "notes/x.md", "Pasted image.png", b"1").unwrap();
        assert_eq!(
            (a.path.as_str(), a.embed.as_str()),
            ("notes/attachments/Pasted image.png", "![[Pasted image.png]]")
        );
        let b = attach(&w, "notes/x.md", "Pasted image.png", b"2").unwrap();
        assert_eq!(b.path, "notes/attachments/Pasted image 1.png");
        let c = attach(&w, "top.md", "../../evil.sh", b"3").unwrap();
        // traversal is flattened into one harmless name inside the attachments folder
        assert!(c.path.starts_with("attachments/") && c.path.matches('/').count() == 1, "{}", c.path);
        assert!(attach(&w, "a.md", "  ", b"").is_err());
    }

    #[test]
    fn tree_is_dirs_first_and_filtered() {
        let (_d, w) = ws();
        let entries = tree(&w, "", false).unwrap();
        let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, [".atlas", "notes", "runs", "A.md", "b.md"]);
        assert!(entries.iter().all(|e| e.ignored == (e.name == "runs")));
        let all: Vec<_> = tree(&w, "", true).unwrap().into_iter().map(|e| e.name).collect();
        assert!(all.contains(&".hidden".to_string()) && !all.contains(&".git".to_string()), "asked: dotfiles too, never .git");
        std::fs::write(w.root().join(".atlas/config.toml"), "[files]\nshow_ignored = false\nshow_hidden = true\n")
            .unwrap();
        let names: Vec<_> = tree(&w, "", false).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, [".atlas", "notes", ".hidden", "A.md", "b.md"], ".git stays hidden always");
    }

    #[test]
    fn tree_names_a_folders_own_note_and_unshown_companions() {
        let (_d, w) = ws();
        std::fs::create_dir_all(w.root().join("refs/k")).unwrap();
        std::fs::write(w.root().join("refs/k/k.md"), "---\ncitekey: k\n---\n").unwrap();
        std::fs::write(w.root().join("refs/k/data.md"), "---\ntitle: d\nshown: false\n---\n# d\n").unwrap();
        std::fs::write(w.root().join("refs/k/mine.md"), "# shown: false is only text here\n").unwrap();
        let top = tree(&w, "refs", false).unwrap();
        assert_eq!(top[0].note.as_deref(), Some("refs/k/k.md"));
        let inner = tree(&w, "refs/k", false).unwrap();
        let unshown: Vec<_> = inner.iter().filter(|e| e.unshown).map(|e| e.name.as_str()).collect();
        assert_eq!(unshown, ["data.md"]);
        assert!(tree(&w, "", false).unwrap().iter().all(|e| e.note.is_none()), "notes/ has no notes/notes.md");
    }

    #[test]
    fn write_then_conflict_on_stale_mtime() {
        let (_d, w) = ws();
        let first =
            write_text(&w, &FileWrite { path: "notes/n.md".into(), text: "one".into(), base_mtime: None, only_new: false, apply_here: false }).unwrap();
        assert_eq!(read_text(&w, "notes/n.md").unwrap().text, "one");
        let stale = Mtime(first.mtime.0 - 1000);
        let err = write_text(&w, &FileWrite { path: "notes/n.md".into(), text: "two".into(), base_mtime: Some(stale), only_new: false, apply_here: false });
        assert!(matches!(err, Err(Error::Conflict { current: Some(m) }) if m == first.mtime));
        write_text(&w, &FileWrite { path: "notes/n.md".into(), text: "two".into(), base_mtime: Some(first.mtime), only_new: false, apply_here: false })
            .unwrap();
        assert_eq!(read_text(&w, "notes/n.md").unwrap().text, "two");
        // No temp files left behind.
        assert_eq!(std::fs::read_dir(w.root().join("notes")).unwrap().count(), 1);
    }

    #[test]
    fn only_new_creates_once_and_never_replaces() {
        let (_d, w) = ws();
        let new = |text: &str| FileWrite { path: "notes/d.excalidraw".into(), text: text.into(), base_mtime: None, only_new: true, apply_here: false };
        assert!(write_text(&w, &new("first")).unwrap().written);
        let again = write_text(&w, &new("second")).unwrap();
        assert!(!again.written, "an existing file is kept, and the answer says so");
        assert_eq!(read_text(&w, "notes/d.excalidraw").unwrap().text, "first");
        assert_eq!(std::fs::read_dir(w.root().join("notes")).unwrap().count(), 1, "no temp file left");
        let both = FileWrite { base_mtime: Some(again.mtime), ..new("x") };
        assert!(matches!(write_text(&w, &both), Err(Error::BadRequest(_))));
    }

    #[test]
    fn non_utf8_is_rejected() {
        let (_d, w) = ws();
        std::fs::write(w.root().join("bin.dat"), [0xff, 0xfe, 0x00]).unwrap();
        assert!(matches!(read_text(&w, "bin.dat"), Err(Error::NotText(_))));
    }
}

// --- managing files from the tree ----------------------------------------------------------------

/// A new, empty folder (parents created).
pub fn mkdir(ws: &Workspace, rel: &str) -> Result<()> {
    let p = ws.resolve(rel)?;
    if p.exists() {
        return Err(Error::Conflict { current: None });
    }
    vault_write::mkdir(&p)
}

/// A file's bytes as given (an upload from the explorer, the local copy of a remote file); parents created.
/// An existing file is a 409 unless `replace`; a folder is never replaced.
pub fn put_bytes(ws: &Workspace, rel: &str, bytes: &[u8], replace: bool) -> Result<()> {
    let p = ws.resolve(rel)?;
    if p.is_dir() || (p.exists() && !replace) {
        return Err(Error::Conflict { current: None });
    }
    vault_write::write(&p, bytes)
}

/// Move / rename inside the workspace; never overwrites (409).
pub fn move_path(ws: &Workspace, from: &str, to: &str) -> Result<()> {
    let (a, b) = (ws.resolve(from)?, ws.resolve(to)?);
    if !a.exists() {
        return Err(Error::NotFound(from.into()));
    }
    if b.exists() {
        return Err(Error::Conflict { current: None });
    }
    vault_write::rename(&a, &b)?;
    // a drawing's companion note follows it; a failure there never undoes the move
    if let Err(e) = crate::drawing_note::moved(ws, from, to) {
        eprintln!("atlas: the note of {from} did not follow it to {to}: {e}");
    }
    Ok(())
}

/// Delete = to the desktop Trash (`gio trash`, recoverable from the file manager); without gio,
/// into `.atlas/trash/<timestamp>/` (still recoverable). Never a hard delete.
pub fn trash(ws: &Workspace, rel: &str) -> Result<String> {
    let p = ws.resolve(rel)?;
    if !p.exists() || rel.trim_matches('/').is_empty() {
        return Err(Error::NotFound(rel.into()));
    }
    // tests never touch the user's desktop Trash (ATLAS_VAULT_TRASH: the e2e server, whose vault may sit on the home disk)
    if !cfg!(test) && std::env::var_os("ATLAS_VAULT_TRASH").is_none() {
        let kind = if p.is_dir() { vault_write::WriteKind::RemoveDir } else { vault_write::WriteKind::Remove };
        let gio = || Ok(std::process::Command::new("gio").arg("trash").arg(&p).output().is_ok_and(|o| o.status.success()));
        if vault_write::guarded(&p, kind, gio)? {
            return Ok("the Trash".into());
        }
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let dest = ws.root().join(".atlas/trash").join(&stamp).join(rel);
    vault_write::rename(&p, &dest)?;
    Ok(format!(".atlas/trash/{stamp}"))
}

#[cfg(test)]
mod manage_tests {
    use super::*;

    #[test]
    fn mkdir_move_trash_never_overwrite_or_hard_delete() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        mkdir(&ws, "notes/new").unwrap();
        assert!(mkdir(&ws, "notes/new").is_err(), "exists");
        std::fs::write(d.path().join("a.md"), "A").unwrap();
        std::fs::write(d.path().join("b.md"), "B").unwrap();
        assert!(move_path(&ws, "a.md", "b.md").is_err(), "no overwrite");
        move_path(&ws, "a.md", "notes/new/a.md").unwrap();
        assert_eq!(std::fs::read_to_string(d.path().join("notes/new/a.md")).unwrap(), "A");
        assert!(move_path(&ws, "a.md", "c.md").is_err(), "gone");
        let to = trash(&ws, "b.md").unwrap();
        assert!(!d.path().join("b.md").exists());
        assert!(to == "the Trash" || d.path().join(&to).join("b.md").exists(), "recoverable: {to}");
        assert!(trash(&ws, "").is_err() && move_path(&ws, "../x", "y").is_err());
    }

    #[test]
    fn uploaded_bytes_land_as_given_and_replace_only_when_asked() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        put_bytes(&ws, "in/new/p.bin", &[0, 1, 2], false).unwrap();
        assert_eq!(std::fs::read(d.path().join("in/new/p.bin")).unwrap(), [0, 1, 2]);
        assert!(matches!(put_bytes(&ws, "in/new/p.bin", b"x", false), Err(Error::Conflict { .. })));
        put_bytes(&ws, "in/new/p.bin", b"x", true).unwrap();
        assert_eq!(std::fs::read(d.path().join("in/new/p.bin")).unwrap(), b"x");
        assert!(put_bytes(&ws, "notes", b"x", true).is_err(), "a folder is never replaced");
        assert!(put_bytes(&ws, "../out.bin", b"x", true).is_err());
        let e = tree(&ws, "in/new", false).unwrap();
        assert_eq!((e[0].size, e[0].modified.is_some()), (Some(1), true));
    }
}
