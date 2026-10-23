//! Freed memory handed back to the system. glibc keeps what Rust frees in its arenas (one per busy thread: 53 in the
//! desktop app after a day) and rarely returns it, so the process grew with each big request and never shrank:
//! 215 MB, of which `malloc_trim` gave back 105 at once. A trim once a minute keeps it near what is really in use;
//! it costs a few ms on a pool thread.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const EVERY: Duration = Duration::from_secs(60);
static STARTED: AtomicBool = AtomicBool::new(false);

/// Starts the trimmer once per process (every server started after the first shares it). Needs a tokio runtime.
pub fn spawn() {
    if !SUPPORTED || STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    tokio::spawn(async {
        let mut tick = tokio::time::interval(EVERY);
        tick.tick().await; // the first tick is at once: the start is still warming up
        loop {
            tick.tick().await;
            let _ = tokio::task::spawn_blocking(trim).await;
        }
    });
}

#[cfg(all(target_os = "linux", target_env = "gnu"))]
const SUPPORTED: bool = true;
#[cfg(not(all(target_os = "linux", target_env = "gnu")))]
const SUPPORTED: bool = false;

/// Returns the free pages at the top of every arena and the free ones inside them (glibc ≥ 2.8).
#[cfg(all(target_os = "linux", target_env = "gnu"))]
pub fn trim() {
    extern "C" {
        fn malloc_trim(pad: usize) -> i32;
    }
    // SAFETY: malloc_trim takes no pointers and is thread-safe (it locks each arena in turn).
    unsafe {
        malloc_trim(0);
    }
}
#[cfg(not(all(target_os = "linux", target_env = "gnu")))]
pub fn trim() {}

#[cfg(test)]
mod tests {
    #[test]
    fn trim_runs() {
        let v: Vec<Vec<u8>> = (0..1000).map(|_| vec![1u8; 64 * 1024]).collect();
        drop(v);
        super::trim(); // must not crash; what it returns is the allocator's business
    }
}
