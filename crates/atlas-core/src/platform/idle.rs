//! How long the person has left this computer alone, as the system knows it: the presence signal of
//! docs/design/DESIGN-calendar-tasks-nudges.md §3.2. Linux asks logind (the session's `LockedHint`, `IdleHint` and
//! `IdleSinceHint`, which KDE and GNOME keep: the screen locker and the idle timeout); Windows its last input. The
//! answer is sampled by `notify::Presence::watch` once a minute; Android and macOS say nothing here (the phone's
//! presence is its page looked at).

/// What the system says about this session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Idle {
    /// In use now.
    No,
    /// Locked or idle since this moment (ms since the epoch), or since a moment the system does not say.
    Since(Option<i64>),
}

/// The system's answer; None when it has none (no logind, a sandbox without access, another system).
pub fn idle() -> Option<Idle> {
    imp::idle()
}

/// logind's three hints as one answer: locked or idle is away, since the idle hint's time when it has one.
pub fn of_hints(locked: bool, idle: bool, idle_since_us: u64) -> Idle {
    if !locked && !idle {
        return Idle::No;
    }
    Idle::Since((idle && idle_since_us > 0).then(|| (idle_since_us / 1000) as i64))
}

#[cfg(all(target_os = "linux", not(target_os = "android")))]
mod imp {
    use super::Idle;

    pub fn idle() -> Option<Idle> {
        let conn = zbus::blocking::Connection::system().ok()?;
        // `auto`: the session of the calling process
        let s = zbus::blocking::Proxy::new(&conn, "org.freedesktop.login1", "/org/freedesktop/login1/session/auto", "org.freedesktop.login1.Session").ok()?;
        let locked: bool = s.get_property("LockedHint").ok()?;
        let idle: bool = s.get_property("IdleHint").ok()?;
        let since: u64 = s.get_property("IdleSinceHint").unwrap_or(0);
        Some(super::of_hints(locked, idle, since))
    }
}

#[cfg(windows)]
mod imp {
    use super::Idle;
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    /// Input in the last minute is use now; else idle since the last input.
    pub fn idle() -> Option<Idle> {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        // SAFETY: `info` is a valid LASTINPUTINFO with its size set, as the call requires
        if unsafe { GetLastInputInfo(&mut info) } == 0 {
            return None;
        }
        // both are milliseconds since boot, wrapping together every 49.7 days
        let idle_ms = unsafe { GetTickCount() }.wrapping_sub(info.dwTime) as i64;
        if idle_ms < 60_000 {
            return Some(Idle::No);
        }
        Some(Idle::Since(Some(chrono::Utc::now().timestamp_millis() - idle_ms)))
    }
}

#[cfg(not(any(all(target_os = "linux", not(target_os = "android")), windows)))]
mod imp {
    pub fn idle() -> Option<super::Idle> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_or_idle_is_away_since_the_idle_hint_when_it_has_one() {
        assert_eq!(of_hints(false, false, 0), Idle::No);
        assert_eq!(of_hints(false, false, 5_000_000), Idle::No, "a stale idle time while in use says nothing");
        assert_eq!(of_hints(false, true, 5_000_000), Idle::Since(Some(5_000)));
        assert_eq!(of_hints(true, false, 0), Idle::Since(None), "locked, since an unknown moment");
        assert_eq!(of_hints(true, false, 5_000_000), Idle::Since(None), "locked without the idle hint: its time is an old one");
    }

    /// This machine's own answer, to look at by hand (`cargo test -p atlas-core --lib idle -- --ignored --nocapture`).
    #[test]
    #[ignore]
    fn this_machine_says() {
        println!("idle: {:?}", idle());
    }
}
