use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitStatus {
    pub available: bool,
    pub branch: Option<String>,
    pub is_dirty: bool,
    pub ahead: i64,
    pub behind: i64,
    pub last_commit_ms: Option<i64>,
}

impl GitStatus {
    fn unavailable() -> Self {
        Self {
            available: false,
            branch: None,
            is_dirty: false,
            ahead: 0,
            behind: 0,
            last_commit_ms: None,
        }
    }
}

fn run_git(path: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    let (tx, rx) = mpsc::channel();
    let path = path.to_path_buf();
    let args: Vec<String> = args.iter().map(|arg| arg.to_string()).collect();

    thread::spawn(move || {
        let output = Command::new("git")
            .arg("-C")
            .arg(&path)
            .args(&args)
            .output();
        let _ = tx.send(output);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    }
}

fn parse_ahead_behind(output: &str) -> (i64, i64) {
    let mut parts = output.split_whitespace();
    let behind = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn parse_last_commit_ms(output: &str) -> Option<i64> {
    let secs: i64 = output.trim().parse().ok()?;
    Some(secs * 1000)
}

pub fn git_status(path: &Path) -> GitStatus {
    let timeout = Duration::from_secs(5);
    let Some(branch_raw) = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"], timeout) else {
        return GitStatus::unavailable();
    };

    let branch = if branch_raw == "HEAD" {
        None
    } else {
        Some(branch_raw)
    };
    let is_dirty = run_git(path, &["status", "--porcelain"], timeout)
        .map(|output| !output.trim().is_empty())
        .unwrap_or(false);
    let (ahead, behind) = run_git(
        path,
        &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
        timeout,
    )
    .map(|output| parse_ahead_behind(&output))
    .unwrap_or((0, 0));
    let last_commit_ms = run_git(path, &["log", "-1", "--format=%ct"], timeout)
        .and_then(|output| parse_last_commit_ms(&output));

    GitStatus {
        available: true,
        branch,
        is_dirty,
        ahead,
        behind,
        last_commit_ms,
    }
}
