use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::git;

const MANIFESTS: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "composer.json",
    "pubspec.yaml",
    "pom.xml",
    "build.gradle",
];

const SOURCE_EXTS: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "py", "go", "rb", "java", "kt", "swift", "c", "cc", "cpp", "h",
    "hpp", "cs", "php", "dart", "vue", "svelte",
];

const EXCLUDED_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    ".venv",
    "Library",
    "build",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionSummary {
    pub agent: String,
    pub label: String,
    pub age: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReadiness {
    pub summary: String,
    pub suggested_action: String,
    pub git_branch: Option<String>,
    pub git_ahead: i64,
    pub git_behind: i64,
    pub changed_files: Vec<String>,
    pub secret_risk: bool,
    pub agent_context_missing: bool,
}

#[derive(Debug, Clone)]
pub struct DetectedProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub agents: Vec<String>,
    pub status: String,
    pub git: String,
    pub risk: String,
    pub confidence: i64,
    pub activity: String,
    pub next_task: String,
    pub notes: String,
    pub recent_files: Vec<String>,
    pub sessions: Vec<SessionSummary>,
    pub readiness: ProjectReadiness,
    pub last_scanned_ms: i64,
    pub last_modified_ms: Option<i64>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn modified_ms(path: &Path) -> Option<i64> {
    let metadata = path.metadata().ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_millis() as i64)
}

fn has_file(dir: &Path, name: &str) -> bool {
    dir.join(name).is_file()
}

fn has_dir(dir: &Path, name: &str) -> bool {
    dir.join(name).is_dir()
}

fn detect_agents(dir: &Path) -> Vec<String> {
    let mut agents = Vec::new();
    if has_file(dir, "CLAUDE.md") || has_dir(dir, ".claude") {
        agents.push("Claude".to_string());
    }
    if has_file(dir, "AGENTS.md") || has_dir(dir, ".codex") {
        agents.push("Codex".to_string());
    }
    if has_file(dir, "GEMINI.md") || has_dir(dir, ".gemini") {
        agents.push("Gemini".to_string());
    }
    if has_dir(dir, ".grok") || has_dir(dir, ".grok-cli") {
        agents.push("Grok".to_string());
    }
    agents
}

fn has_manifest(dir: &Path) -> bool {
    MANIFESTS.iter().any(|manifest| has_file(dir, manifest))
}

fn has_secret_marker(dir: &Path) -> bool {
    [".env", ".env.local", ".env.production", ".env.development"]
        .iter()
        .any(|name| has_file(dir, name))
}

fn is_project(dir: &Path) -> bool {
    has_manifest(dir)
        || has_dir(dir, ".git")
        || has_file(dir, "CLAUDE.md")
        || has_file(dir, "AGENTS.md")
        || has_file(dir, "GEMINI.md")
}

fn recent_files(dir: &Path) -> (Vec<String>, Option<i64>) {
    let mut files: Vec<(String, i64)> = Vec::new();
    collect_recent_files(dir, dir, 0, &mut files);
    files.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let last_modified = files.first().map(|(_, modified)| *modified);
    let names = files.into_iter().take(4).map(|(name, _)| name).collect();
    (names, last_modified)
}

fn collect_recent_files(root: &Path, dir: &Path, depth: usize, files: &mut Vec<(String, i64)>) {
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if EXCLUDED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            collect_recent_files(root, &path, depth + 1, files);
            continue;
        }
        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        let is_useful = SOURCE_EXTS.contains(&extension)
            || MANIFESTS.iter().any(|manifest| *manifest == name)
            || matches!(
                name.as_str(),
                "README.md" | "CLAUDE.md" | "AGENTS.md" | "GEMINI.md"
            );
        if !is_useful {
            continue;
        }
        if let Some(modified) = modified_ms(&path) {
            let relative = path
                .strip_prefix(root)
                .ok()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or(name);
            files.push((relative, modified));
        }
    }
}

fn relative_age(now: i64, timestamp: Option<i64>) -> String {
    let Some(timestamp) = timestamp else {
        return "unknown".to_string();
    };
    let elapsed = (now - timestamp).max(0);
    let minute = 60_000;
    let hour = 60 * minute;
    let day = 24 * hour;
    if elapsed < minute {
        "just now".to_string()
    } else if elapsed < hour {
        format!("{} min ago", elapsed / minute)
    } else if elapsed < day {
        format!("{} hrs ago", elapsed / hour)
    } else {
        format!("{} days ago", elapsed / day)
    }
}

fn git_label(status: &git::GitStatus) -> String {
    if !status.available {
        return "Clean".to_string();
    }
    if status.is_dirty {
        "Dirty".to_string()
    } else if status.ahead > 0 {
        "Ahead".to_string()
    } else if status.behind > 0 {
        "Behind".to_string()
    } else {
        "Clean".to_string()
    }
}

fn project_status(now: i64, git: &git::GitStatus, last_modified: Option<i64>) -> String {
    if git.is_dirty {
        return "Active".to_string();
    }
    let active_window = 7 * 86_400_000;
    let dormant_window = 45 * 86_400_000;
    match last_modified {
        Some(modified) if now - modified <= active_window => "Active".to_string(),
        Some(modified) if now - modified > dormant_window => "Dormant".to_string(),
        _ => "Recent".to_string(),
    }
}

fn confidence(dir: &Path, agents: &[String], git: &git::GitStatus) -> i64 {
    let mut score = 36;
    if has_manifest(dir) {
        score += 24;
    }
    if git.available {
        score += 12;
    }
    score += (agents.len() as i64 * 10).min(24);
    if has_secret_marker(dir) {
        score -= 8;
    }
    score.clamp(35, 99)
}

fn next_task(risk: &str, git_label: &str, agents: &[String]) -> String {
    if risk == "Secret flagged" {
        "Review local env files before launching agents".to_string()
    } else if risk == "Needs agent file" {
        "Create an agent context file so tools know project rules".to_string()
    } else if git_label == "Dirty" {
        "Review working tree and decide what should ship next".to_string()
    } else if agents.len() > 1 {
        "Run a workflow council to reconcile agent handoffs".to_string()
    } else {
        "Ready for focused agent work".to_string()
    }
}

fn readiness_signal(
    risk: &str,
    git_label: &str,
    git: &git::GitStatus,
    agents: &[String],
    next_task: &str,
) -> ProjectReadiness {
    let mut changed_files = git.changed_files.clone();
    changed_files.truncate(8);

    let summary = if risk == "Secret flagged" {
        "Secret-shaped files detected by filename only".to_string()
    } else if agents.is_empty() {
        "Agent context is missing".to_string()
    } else if git_label == "Dirty" {
        "Working tree has uncommitted changes".to_string()
    } else if git.ahead > 0 || git.behind > 0 {
        "Branch is not aligned with upstream".to_string()
    } else {
        "Project is ready for focused agent work".to_string()
    };

    ProjectReadiness {
        summary,
        suggested_action: next_task.to_string(),
        git_branch: git.branch.clone(),
        git_ahead: git.ahead,
        git_behind: git.behind,
        changed_files,
        secret_risk: risk == "Secret flagged",
        agent_context_missing: agents.is_empty(),
    }
}

fn detect_project(dir: &Path, now: i64) -> Option<DetectedProject> {
    if !is_project(dir) {
        return None;
    }
    let path = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    let path_string = path.to_string_lossy().to_string();
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path_string.clone());
    let agents = detect_agents(&path);
    let git_status = git::git_status(&path);
    let git = git_label(&git_status);
    let (recent_files, last_modified) = recent_files(&path);
    let status = project_status(
        now,
        &git_status,
        last_modified.or(git_status.last_commit_ms),
    );
    let risk = if has_secret_marker(&path) {
        "Secret flagged"
    } else if agents.is_empty() {
        "Needs agent file"
    } else if git == "Dirty" {
        "Review"
    } else {
        "Clear"
    }
    .to_string();
    let confidence = confidence(&path, &agents, &git_status);
    let activity = relative_age(now, last_modified.or(git_status.last_commit_ms));
    let next_task = next_task(&risk, &git, &agents);
    let readiness = readiness_signal(&risk, &git, &git_status, &agents, &next_task);
    let notes = if agents.is_empty() {
        "Detected from repository markers. Add an agent context file for stronger automation."
            .to_string()
    } else {
        format!(
            "Detected local project with {} configured agent signal(s).",
            agents.len()
        )
    };
    let sessions = agents
        .iter()
        .map(|agent| SessionSummary {
            agent: agent.clone(),
            label: "Local project signal".to_string(),
            age: activity.clone(),
        })
        .collect();

    Some(DetectedProject {
        id: crate::db::project_id(&path_string),
        name,
        path: path_string,
        agents,
        status,
        git,
        risk: risk.clone(),
        confidence,
        activity,
        next_task,
        notes,
        recent_files,
        sessions,
        readiness,
        last_scanned_ms: now,
        last_modified_ms: last_modified,
    })
}

pub fn scan_project(path: &Path) -> Option<DetectedProject> {
    detect_project(path, now_ms())
}

fn is_excluded(path: &Path, is_dir: bool, excludes: &HashSet<String>) -> bool {
    if !is_dir {
        return false;
    }
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| excludes.contains(name) || EXCLUDED_DIRS.contains(&name))
        .unwrap_or(false)
}

pub fn scan_roots(roots: &[PathBuf], max_depth: usize) -> Vec<DetectedProject> {
    let now = now_ms();
    let excludes: HashSet<String> = EXCLUDED_DIRS.iter().map(|name| name.to_string()).collect();
    let mut projects = Vec::new();

    for root in roots.iter().filter(|root| root.exists()) {
        let mut builder = WalkBuilder::new(root);
        builder
            .standard_filters(false)
            .max_depth(Some(max_depth))
            .filter_entry({
                let excludes = excludes.clone();
                move |entry| {
                    !is_excluded(
                        entry.path(),
                        entry
                            .file_type()
                            .map(|file_type| file_type.is_dir())
                            .unwrap_or(false),
                        &excludes,
                    )
                }
            });

        for entry in builder.build().flatten() {
            if entry.file_type().map(|file_type| file_type.is_dir()) != Some(true) {
                continue;
            }
            if let Some(project) = detect_project(entry.path(), now) {
                projects.push(project);
            }
        }
    }

    projects.sort_by(|a, b| b.confidence.cmp(&a.confidence).then(a.name.cmp(&b.name)));
    projects.dedup_by(|a, b| a.path == b.path);
    projects
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn scan_roots_detects_manifest_and_agent_context() {
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join("command-test");
        fs::create_dir(&project_dir).unwrap();
        fs::write(project_dir.join("package.json"), "{}").unwrap();
        fs::write(project_dir.join("AGENTS.md"), "Local rules").unwrap();
        fs::create_dir(project_dir.join("node_modules")).unwrap();
        fs::write(project_dir.join("node_modules/package.json"), "{}").unwrap();

        let projects = scan_roots(&[temp.path().to_path_buf()], 4);

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "command-test");
        assert_eq!(projects[0].agents, vec!["Codex"]);
        assert_eq!(projects[0].risk, "Clear");
        assert!(projects[0].recent_files.contains(&"AGENTS.md".to_string()));
    }

    #[test]
    fn secret_risk_is_filename_only() {
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join("secret-test");
        fs::create_dir(&project_dir).unwrap();
        fs::write(project_dir.join("package.json"), "{}").unwrap();
        fs::write(
            project_dir.join(".env.local"),
            "API_TOKEN=should-not-appear",
        )
        .unwrap();

        let projects = scan_roots(&[temp.path().to_path_buf()], 4);

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].risk, "Secret flagged");
        assert!(projects[0].readiness.secret_risk);
        assert!(projects[0].readiness.summary.contains("filename only"));
        assert!(!projects[0].readiness.summary.contains("should-not-appear"));
        assert!(!projects[0].notes.contains("should-not-appear"));
    }
}
