//! Processes and machine facts that differ per OS: whether a pid lives, a child in a group of its own (so a timeout
//! or a stop takes its children with it), a program started to outlive Atlas, the host name, and a file's identity.

/// Windows creation flags (winbase.h), written out so the core needs no more of the Windows API than it uses.
#[cfg(windows)]
mod flags {
    pub const DETACHED_PROCESS: u32 = 0x0000_0008;
    pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
}

/// Whether process `pid` is running.
pub fn pid_alive(pid: u32) -> bool {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        std::path::Path::new(&format!("/proc/{pid}")).exists()
    }
    #[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
    {
        let Ok(pid) = i32::try_from(pid) else { return false };
        // signal 0 checks without sending; EPERM means it exists but is another user's
        unsafe { libc::kill(pid, 0) == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM) }
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
        use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut code = 0u32;
            let ok = GetExitCodeProcess(h, &mut code) != 0;
            CloseHandle(h);
            ok && code == STILL_ACTIVE as u32
        }
    }
}

/// The child gets a process group of its own (Windows: a new group, and no console window flashing up).
pub fn own_group(cmd: &mut tokio::process::Command) {
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    cmd.creation_flags(flags::CREATE_NEW_PROCESS_GROUP | flags::CREATE_NO_WINDOW);
}

/// [`own_group`] for a blocking `std::process::Command` (a run on a thread of its own: js_exec.rs).
pub fn own_group_blocking(cmd: &mut std::process::Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(flags::CREATE_NEW_PROCESS_GROUP | flags::CREATE_NO_WINDOW);
    }
}

/// How [`stop_group`] ends a group.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    /// Asked to end (SIGTERM); Windows has no such ask for a windowless program, so it is ended there too.
    Ask,
    /// Ended now (SIGKILL).
    Kill,
}

/// Ends the group started by [`own_group`] whose leader is `pid`, children included.
pub fn stop_group(pid: u32, how: Stop) {
    #[cfg(unix)]
    {
        let sig = match how {
            Stop::Ask => "-TERM",
            Stop::Kill => "-KILL",
        };
        let _ = std::process::Command::new("kill").args([sig, "--", &format!("-{pid}")]).status();
    }
    #[cfg(windows)]
    {
        let _ = how;
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(flags::CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}

/// The program outlives the one starting it: not in its group (Unix), not on its console (Windows).
pub fn detach(cmd: &mut std::process::Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(flags::DETACHED_PROCESS | flags::CREATE_NEW_PROCESS_GROUP);
    }
}

/// This machine's name ("" when unknown).
pub fn hostname() -> String {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    if let Ok(h) = std::fs::read_to_string("/proc/sys/kernel/hostname") {
        return h.trim().to_string();
    }
    #[cfg(unix)]
    {
        let mut buf = [0u8; 256];
        if unsafe { libc::gethostname(buf.as_mut_ptr().cast(), buf.len()) } == 0 {
            let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
            return String::from_utf8_lossy(&buf[..end]).trim().to_string();
        }
    }
    ["HOSTNAME", "COMPUTERNAME"].iter().find_map(|v| std::env::var(v).ok()).unwrap_or_default().trim().to_string()
}

/// A number that changes when a path names another file: the inode on Unix. Windows' file index needs an open
/// handle, so there the creation time stands in — a save writes a new file and renames it over, which is new.
pub fn file_id(meta: &std::fs::Metadata) -> u64 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        meta.ino()
    }
    #[cfg(not(unix))]
    {
        meta.created().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos() as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn this_process_is_alive() {
        assert!(pid_alive(std::process::id()));
        assert!(!pid_alive(u32::MAX - 7));
    }

    #[test]
    fn a_hostname_is_known() {
        assert!(!hostname().is_empty());
    }
}
