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
    pub changed_files: Vec<String>,
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
            changed_files: Vec::new(),
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

fn parse_changed_files(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| {
            let path = line.get(3..).unwrap_or(line).trim();
            let path = path.split(" -> ").last().unwrap_or(path).trim();
            if path.is_empty() {
                None
            } else {
                Some(path.to_string())
            }
        })
        .take(12)
        .collect()
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
    let status_output = run_git(path, &["status", "--porcelain"], timeout).unwrap_or_default();
    let is_dirty = !status_output.trim().is_empty();
    let changed_files = parse_changed_files(&status_output);
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
        changed_files,
        last_commit_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_changed_files_from_porcelain_status() {
        let files = parse_changed_files(
            " M src/App.tsx\nA  docs/ROADMAP.md\nR  old-name.md -> new-name.md\n?? .env.local\n",
        );

        assert_eq!(
            files,
            vec![
                "src/App.tsx",
                "docs/ROADMAP.md",
                "new-name.md",
                ".env.local"
            ]
        );
    }

    #[test]
    fn parses_ahead_behind_counts() {
        assert_eq!(parse_ahead_behind("2 5"), (5, 2));
        assert_eq!(parse_ahead_behind("bad data"), (0, 0));
    }
}
