//! A RAR (4 or 5) unpacked through libarchive (BSD-2), compiled into the program (build.rs): where no RAR program
//! (bsdtar, unar, unrar) can be run — the phone. Only regular files come out, each under the target folder (a name
//! that is absolute or climbs with `..` is refused); folders are made as needed. Encrypted entries fail with
//! libarchive's message.
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

#[repr(C)]
struct Archive {
    _p: [u8; 0],
}
#[repr(C)]
struct Entry {
    _p: [u8; 0],
}

const OK: c_int = 0;
const EOF: c_int = 1;
const WARN: c_int = -20;
const IFREG: u32 = 0o100000;
const IFMT: u32 = 0o170000;

extern "C" {
    fn archive_read_new() -> *mut Archive;
    fn archive_read_support_format_rar(a: *mut Archive) -> c_int;
    fn archive_read_support_format_rar5(a: *mut Archive) -> c_int;
    fn archive_read_open_filename(a: *mut Archive, name: *const c_char, block: usize) -> c_int;
    fn archive_read_next_header(a: *mut Archive, e: *mut *mut Entry) -> c_int;
    fn archive_read_data(a: *mut Archive, buf: *mut c_void, len: usize) -> isize;
    fn archive_read_free(a: *mut Archive) -> c_int;
    fn archive_error_string(a: *mut Archive) -> *const c_char;
    fn archive_entry_pathname_utf8(e: *mut Entry) -> *const c_char;
    fn archive_entry_pathname(e: *mut Entry) -> *const c_char;
    fn archive_entry_filetype(e: *mut Entry) -> libc::mode_t;
}

/// The reader, freed however the unpacking ends.
struct Reader(*mut Archive);

impl Drop for Reader {
    fn drop(&mut self) {
        unsafe { archive_read_free(self.0) };
    }
}

impl Reader {
    fn error(&self, what: &str) -> String {
        let msg = unsafe { archive_error_string(self.0) };
        let msg = if msg.is_null() { "unknown error".into() } else { unsafe { CStr::from_ptr(msg) }.to_string_lossy().into_owned() };
        format!("RAR: {what}: {msg}")
    }
}

/// Every regular file of RAR `src` written under `into`.
pub fn unpack(src: &Path, into: &Path) -> Result<(), String> {
    let name = path_cstring(src)?;
    let r = Reader(unsafe { archive_read_new() });
    if r.0.is_null() {
        return Err("RAR: no memory for a reader".into());
    }
    unsafe {
        archive_read_support_format_rar(r.0);
        archive_read_support_format_rar5(r.0);
    }
    if unsafe { archive_read_open_filename(r.0, name.as_ptr(), 1 << 16) } != OK {
        return Err(r.error(&src.display().to_string()));
    }
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let mut e: *mut Entry = std::ptr::null_mut();
        match unsafe { archive_read_next_header(r.0, &mut e) } {
            EOF => return Ok(()),
            OK | WARN => {}
            _ => return Err(r.error("reading the next entry")),
        }
        if (unsafe { archive_entry_filetype(e) } as u32) & IFMT != IFREG {
            continue;
        }
        let entry = entry_name(e).ok_or("RAR: an entry without a name")?;
        let rel = safe_relative(&entry).ok_or_else(|| format!("RAR: the entry {entry:?} leaves the folder"))?;
        let out = into.join(rel);
        if let Some(dir) = out.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| format!("{}: {e}", out.display()))?;
        loop {
            let n = unsafe { archive_read_data(r.0, buf.as_mut_ptr().cast(), buf.len()) };
            if n == 0 {
                break;
            }
            if n < 0 {
                return Err(r.error(&entry));
            }
            f.write_all(&buf[..n as usize]).map_err(|e| format!("{}: {e}", out.display()))?;
        }
    }
}

fn entry_name(e: *mut Entry) -> Option<String> {
    let p = unsafe { archive_entry_pathname_utf8(e) };
    let p = if p.is_null() { unsafe { archive_entry_pathname(e) } } else { p };
    (!p.is_null()).then(|| unsafe { CStr::from_ptr(p) }.to_string_lossy().replace('\\', "/"))
}

/// `name` as a path under the target folder: only plain parts (`.` dropped); absolute or `..` → None.
fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut rel = PathBuf::new();
    for c in Path::new(name).components() {
        match c {
            Component::Normal(p) => rel.push(p),
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!rel.as_os_str().is_empty()).then_some(rel)
}

#[cfg(unix)]
fn path_cstring(p: &Path) -> Result<CString, String> {
    use std::os::unix::ffi::OsStrExt;
    CString::new(p.as_os_str().as_bytes()).map_err(|_| format!("{}: a NUL in the path", p.display()))
}

#[cfg(not(unix))]
fn path_cstring(p: &Path) -> Result<CString, String> {
    CString::new(p.to_str().ok_or_else(|| format!("{}: not UTF-8", p.display()))?).map_err(|_| format!("{}: a NUL in the path", p.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_stay_under_the_folder() {
        assert_eq!(safe_relative("ch1/./p01.jpg"), Some(PathBuf::from("ch1/p01.jpg")));
        assert_eq!(safe_relative("../evil.jpg"), None);
        assert_eq!(safe_relative("/etc/passwd"), None);
        assert_eq!(safe_relative("a/../../b"), None);
        assert_eq!(safe_relative("."), None);
    }

    #[test]
    fn a_file_that_is_not_a_rar_is_refused_with_libarchives_reason() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("x.cbr");
        std::fs::write(&f, b"PK\x03\x04 not a rar").unwrap();
        let e = unpack(&f, d.path()).unwrap_err();
        assert!(e.starts_with("RAR:"), "{e}");
    }
}
