//! Running a program to its end with a time limit: what it printed and how it ended (None: killed at the limit, or it
//! could not start).
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub struct Ran {
    pub code: Option<i32>,
    pub out: String,
    pub err: String,
}

impl Ran {
    pub fn ok(&self) -> bool {
        self.code == Some(0)
    }
}

/// `argv` with `input` on its stdin (none: nothing to read), its output kept, killed after `limit`.
pub fn run(argv: &[String], input: Option<&str>, limit: Duration) -> Ran {
    let mut cmd = Command::new(&argv[0]);
    cmd.args(&argv[1..]).stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() }).stdout(Stdio::piped()).stderr(Stdio::piped());
    let Ok(mut child) = cmd.spawn() else {
        return Ran { code: None, out: String::new(), err: format!("{} could not be started", argv[0]) };
    };
    if let (Some(mut stdin), Some(text)) = (child.stdin.take(), input) {
        let text = text.to_string();
        std::thread::spawn(move || drop(stdin.write_all(text.as_bytes())));
    }
    let reader = |r: Option<Box<dyn Read + Send>>| std::thread::spawn(move || {
        let mut s = Vec::new();
        if let Some(mut r) = r {
            let _ = r.read_to_end(&mut s);
        }
        String::from_utf8_lossy(&s).into_owned()
    });
    let out = reader(child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>));
    let err = reader(child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>));
    let end = Instant::now() + limit;
    let code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code(),
            Ok(None) if Instant::now() < end => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    Ran { code, out: out.join().unwrap_or_default(), err: err.join().unwrap_or_default() }
}

/// `argv` with nothing in or out, to its end or `limit` — for an ssh that leaves a master running, which keeps any pipe
/// it was given open (a captured output would never end).
pub fn quiet(argv: &[String], limit: Duration) -> bool {
    let Ok(mut child) = Command::new(&argv[0]).args(&argv[1..]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() else {
        return false;
    };
    let end = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < end => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}
