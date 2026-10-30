//! One error type for the core; each variant maps to exactly one HTTP status.
use crate::api::Mtime;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid path: {0}")]
    BadPath(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("file changed on disk since it was read")]
    Conflict { current: Option<Mtime> },
    #[error("file too large: {0}")]
    TooLarge(String),
    #[error("not a UTF-8 text file: {0}")]
    NotText(String),
    #[error("command failed: {0}")]
    CommandFailed(String),
    #[error("io: {0}")]
    Io(std::io::Error),
    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

// a missing file is the caller's 404 (an embed naming a base that is gone), not the server failing
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound { Error::NotFound(e.to_string()) } else { Error::Io(e) }
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;
