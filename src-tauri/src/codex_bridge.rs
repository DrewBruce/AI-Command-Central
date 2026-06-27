use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

use crate::db::ProjectRecord;
use crate::flow::FlowRun;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexBridgeStatus {
    pub available: bool,
    pub path: Option<String>,
    pub detail: String,
}

pub type ClaudeBridgeStatus = CodexBridgeStatus;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatAssignments {
    pub brief: String,
    pub scan: String,
    pub risk: String,
    pub chair: String,
    pub judge: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowProgressEvent {
    pub run_id: String,
    pub node_id: String,
    pub status: String,
    pub label: String,
    pub detail: String,
    pub completed_node_ids: Vec<String>,
    pub elapsed_ms: Option<i64>,
}

struct BridgeSeat {
    assignment_id: &'static str,
    flow_seat_id: &'static str,
    title: &'static str,
    role: &'static str,
    instruction: &'static str,
}

struct BridgeSeatOutput {
    flow_seat_id: &'static str,
    role: &'static str,
    content: String,
}

impl Default for SeatAssignments {
    fn default() -> Self {
        Self {
            brief: "system".to_string(),
            scan: "codex".to_string(),
            risk: "codex".to_string(),
            chair: "claude".to_string(),
            judge: "codex".to_string(),
        }
    }
}

impl SeatAssignments {
    fn runner_for(&self, assignment_id: &str) -> &str {
        match assignment_id {
            "brief" => &self.brief,
            "scan" => &self.scan,
            "risk" => &self.risk,
            "chair" => &self.chair,
            "judge" => &self.judge,
            _ => "demo",
        }
    }

    pub fn judge_is_local(&self) -> bool {
        self.judge == "local"
    }
}

pub fn status() -> CodexBridgeStatus {
    match resolve_codex_binary() {
        Some(path) => {
            let version = Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "codex CLI found".to_string());
            CodexBridgeStatus {
                available: true,
                path: Some(path.to_string_lossy().to_string()),
                detail: version,
            }
        }
        None => CodexBridgeStatus {
            available: false,
            path: None,
            detail: "codex CLI was not found on PATH. Install or expose Codex before running Codex seats.".to_string(),
        },
    }
}

pub fn claude_status() -> ClaudeBridgeStatus {
    match resolve_claude_binary() {
        Some(path) => {
            let version = Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "claude CLI found".to_string());
            CodexBridgeStatus {
                available: true,
                path: Some(path.to_string_lossy().to_string()),
                detail: version,
            }
        }
        None => CodexBridgeStatus {
            available: false,
            path: None,
            detail: "claude CLI was not found on PATH. Install or expose Claude before running Claude seats.".to_string(),
        },
    }
}

pub fn emit_flow_progress<R: Runtime>(
    app: &AppHandle<R>,
    run_id: &str,
    node_id: &str,
    status: &str,
    label: impl Into<String>,
    detail: impl Into<String>,
    completed_node_ids: &[String],
    elapsed_ms: Option<i64>,
) {
    let _ = app.emit(
        "flow-progress",
        FlowProgressEvent {
            run_id: run_id.to_string(),
            node_id: node_id.to_string(),
            status: status.to_string(),
            label: label.into(),
            detail: detail.into(),
            completed_node_ids: completed_node_ids.to_vec(),
            elapsed_ms,
        },
    );
}

pub async fn apply_cli_seats(
    app: &AppHandle,
    run: &mut FlowRun,
    assignments: &SeatAssignments,
    project: &ProjectRecord,
    completed_node_ids: &mut Vec<String>,
    cancel_requested: Arc<AtomicBool>,
) -> Result<(), String> {
    let has_codex = all_council_seats()
        .iter()
        .any(|seat| assignments.runner_for(seat.assignment_id) == "codex");
    let has_claude = all_council_seats()
        .iter()
        .any(|seat| assignments.runner_for(seat.assignment_id) == "claude");
    let codex_binary = if has_codex {
        Some(resolve_codex_binary().ok_or_else(|| {
            "Codex CLI is not available. Install Codex or remove Codex seat assignments."
                .to_string()
        })?)
    } else {
        None
    };
    let claude_binary = if has_claude {
        Some(resolve_claude_binary().ok_or_else(|| {
            "Claude CLI is not available. Install Claude or remove Claude seat assignments."
                .to_string()
        })?)
    } else {
        None
    };
    let mut ran_codex = false;
    let mut ran_claude = false;

    for seat in all_council_seats() {
        let prior_outputs = prior_outputs_for_assignment(run, seat.assignment_id);
        let prompt = build_seat_prompt(&seat, project, run, &prior_outputs);
        ensure_not_cancelled(&cancel_requested)?;
        match assignments.runner_for(seat.assignment_id) {
            "codex" => {
                emit_flow_progress(
                    app,
                    &run.id,
                    seat.assignment_id,
                    "started",
                    format!("{} running", seat.title),
                    format!("Codex agent is executing the {} seat.", seat.title),
                    completed_node_ids,
                    None,
                );
                let binary = codex_binary
                    .clone()
                    .ok_or_else(|| "Codex CLI is not available.".to_string())?;
                let workdir = PathBuf::from(&project.path);
                let started = Instant::now();
                let cancel_for_task = cancel_requested.clone();
                let output = tauri::async_runtime::spawn_blocking(move || {
                    run_codex_exec(&binary, &workdir, &prompt, cancel_for_task)
                })
                .await
                .map_err(|error| error.to_string())??;
                ensure_not_cancelled(&cancel_requested)?;
                let elapsed_ms = started.elapsed().as_millis().min(i64::MAX as u128) as i64;
                apply_output_to_run(
                    run,
                    BridgeSeatOutput {
                        flow_seat_id: seat.flow_seat_id,
                        role: seat.role,
                        content: output,
                    },
                    "Codex agent",
                    Some(elapsed_ms),
                );
                mark_node_completed(completed_node_ids, seat.assignment_id);
                emit_flow_progress(
                    app,
                    &run.id,
                    seat.assignment_id,
                    "completed",
                    format!("{} complete", seat.title),
                    format!(
                        "Codex agent finished {} in {}.",
                        seat.title,
                        duration_label(elapsed_ms)
                    ),
                    completed_node_ids,
                    Some(elapsed_ms),
                );
                ran_codex = true;
            }
            "claude" => {
                emit_flow_progress(
                    app,
                    &run.id,
                    seat.assignment_id,
                    "started",
                    format!("{} running", seat.title),
                    format!("Claude agent is executing the {} seat.", seat.title),
                    completed_node_ids,
                    None,
                );
                let binary = claude_binary
                    .clone()
                    .ok_or_else(|| "Claude CLI is not available.".to_string())?;
                let workdir = PathBuf::from(&project.path);
                let started = Instant::now();
                let cancel_for_task = cancel_requested.clone();
                let output = tauri::async_runtime::spawn_blocking(move || {
                    run_claude_print(&binary, &workdir, &prompt, cancel_for_task)
                })
                .await
                .map_err(|error| error.to_string())??;
                ensure_not_cancelled(&cancel_requested)?;
                let elapsed_ms = started.elapsed().as_millis().min(i64::MAX as u128) as i64;
                apply_output_to_run(
                    run,
                    BridgeSeatOutput {
                        flow_seat_id: seat.flow_seat_id,
                        role: seat.role,
                        content: output,
                    },
                    "Claude agent",
                    Some(elapsed_ms),
                );
                mark_node_completed(completed_node_ids, seat.assignment_id);
                emit_flow_progress(
                    app,
                    &run.id,
                    seat.assignment_id,
                    "completed",
                    format!("{} complete", seat.title),
                    format!(
                        "Claude agent finished {} in {}.",
                        seat.title,
                        duration_label(elapsed_ms)
                    ),
                    completed_node_ids,
                    Some(elapsed_ms),
                );
                ran_claude = true;
            }
            "system" | "demo" => {
                mark_node_completed(completed_node_ids, seat.assignment_id);
                emit_flow_progress(
                    app,
                    &run.id,
                    seat.assignment_id,
                    "completed",
                    format!("{} complete", seat.title),
                    format!(
                        "{} used the prepared deterministic context.",
                        runner_label(assignments.runner_for(seat.assignment_id))
                    ),
                    completed_node_ids,
                    Some(0),
                );
            }
            "local" => {
                if seat.assignment_id != "judge" {
                    mark_node_completed(completed_node_ids, seat.assignment_id);
                    emit_flow_progress(
                        app,
                        &run.id,
                        seat.assignment_id,
                        "completed",
                        format!("{} complete", seat.title),
                        "Local model execution is currently reserved for the Judge seat; prepared context was retained for this seat.",
                        completed_node_ids,
                        Some(0),
                    );
                }
            }
            _ => {}
        }
    }

    if ran_claude {
        run.sources
            .insert(0, "Claude CLI bridge · prompt-mode plan".to_string());
        run.caveats.insert(
            0,
            "Claude seats were executed through `claude -p --bare` with session persistence disabled."
                .to_string(),
        );
    }
    if ran_codex {
        run.sources
            .insert(0, "Codex CLI bridge · read-only sandbox".to_string());
        run.caveats.insert(
            0,
            "Codex seats were executed through `codex exec` with read-only sandboxing and no approval prompts."
                .to_string(),
        );
    }
    if ran_codex || ran_claude {
        run.summary = format!(
            "Live CLI bridges executed assigned Council seats. {}",
            run.guardrail
        );
    }

    Ok(())
}

pub fn mark_node_completed(completed_node_ids: &mut Vec<String>, node_id: &str) {
    if !completed_node_ids.iter().any(|id| id == node_id) {
        completed_node_ids.push(node_id.to_string());
    }
}

#[cfg(test)]
fn codex_seats(assignments: &SeatAssignments) -> Vec<BridgeSeat> {
    all_council_seats()
        .into_iter()
        .filter(|seat| assignments.runner_for(seat.assignment_id) == "codex")
        .collect()
}

#[cfg(test)]
fn claude_seats(assignments: &SeatAssignments) -> Vec<BridgeSeat> {
    all_council_seats()
        .into_iter()
        .filter(|seat| assignments.runner_for(seat.assignment_id) == "claude")
        .collect()
}

fn all_council_seats() -> Vec<BridgeSeat> {
    vec![
        BridgeSeat {
            assignment_id: "brief",
            flow_seat_id: "brief",
            title: "Context packet",
            role: "Question + project context",
            instruction: "Prepare the agent handoff packet: summarize the Council question, project metadata, and guardrails the other seats should use. Do not treat the packet as a second question.",
        },
        BridgeSeat {
            assignment_id: "scan",
            flow_seat_id: "researcher",
            title: "Researcher",
            role: "Inspect",
            instruction: "Inspect the local project read-only. Find the most relevant files, signals, and facts for the Council question.",
        },
        BridgeSeat {
            assignment_id: "risk",
            flow_seat_id: "critic",
            title: "Critic",
            role: "Stress test",
            instruction: "Stress-test the proposed direction. Identify blockers, hidden assumptions, and safety or project guardrail risks.",
        },
        BridgeSeat {
            assignment_id: "chair",
            flow_seat_id: "chair",
            title: "Chair",
            role: "Synthesis",
            instruction: "Synthesize the evidence into a practical recommendation with a clear next move.",
        },
        BridgeSeat {
            assignment_id: "judge",
            flow_seat_id: "judge",
            title: "Judge",
            role: "Decision",
            instruction: "Return the final Council decision. Be direct, include caveats, and state the next action.",
        },
    ]
}

fn build_seat_prompt(
    seat: &BridgeSeat,
    project: &ProjectRecord,
    run: &FlowRun,
    prior_outputs: &[String],
) -> String {
    format!(
        "You are the {title} seat in AI Command Central's Project Review Council.\n\n\
Hard constraints:\n\
- Work read-only. Do not edit, create, delete, move, or overwrite files.\n\
- Do not run package install, git mutation, network-changing, or destructive commands.\n\
- You may inspect local files and git state only as needed.\n\
- Do not reveal secrets or environment values.\n\
- Keep the response concise and useful for a UI report.\n\n\
Seat role: {role}\n\
Seat task: {instruction}\n\n\
Council question from Drew:\n{prompt}\n\n\
Context packet added by AI Command Central:\n\
- Name: {name}\n\
- Path: {path}\n\
- Git state: {git}\n\
- Risk: {risk}\n\
- Confidence: {confidence}\n\
- Next task: {next_task}\n\
- Recent files: {recent_files}\n\n\
Prior seat outputs:\n{prior}\n\n\
Return exactly these sections:\n\
Summary:\n\
Evidence:\n\
Risk or caveat:\n\
Recommendation:",
        title = seat.title,
        role = seat.role,
        instruction = seat.instruction,
        prompt = run.prompt,
        name = project.name,
        path = project.path,
        git = project.git,
        risk = project.risk,
        confidence = project.confidence,
        next_task = project.next_task,
        recent_files = if project.recent_files.is_empty() {
            "No recent files indexed".to_string()
        } else {
            project.recent_files.join(", ")
        },
        prior = if prior_outputs.is_empty() {
            "None yet".to_string()
        } else {
            prior_outputs.join("\n\n")
        }
    )
}

pub(crate) fn run_codex_exec(
    binary: &Path,
    workdir: &Path,
    prompt: &str,
    cancel_requested: Arc<AtomicBool>,
) -> Result<String, String> {
    let output_path = temp_file_path("ai-command-central-codex-seat", "md");
    let stderr_path = temp_file_path("ai-command-central-codex-seat", "stderr.log");
    let stderr_file = fs::File::create(&stderr_path).map_err(|error| error.to_string())?;

    let mut child = Command::new(binary)
        .arg("--ask-for-approval")
        .arg("never")
        .arg("exec")
        .arg("--sandbox")
        .arg("read-only")
        .arg("--skip-git-repo-check")
        .arg("--ephemeral")
        .arg("--ignore-rules")
        .arg("--color")
        .arg("never")
        .arg("--cd")
        .arg(workdir)
        .arg("--output-last-message")
        .arg(&output_path)
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|error| format!("Could not start codex exec: {error}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "Could not write prompt to codex exec.".to_string())?;
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|error| format!("Could not write Codex prompt: {error}"))?;
    }
    drop(child.stdin.take());

    let status = wait_for_child_with_cancel(&mut child, &cancel_requested, "Codex seat")?;
    let stderr = fs::read_to_string(&stderr_path).unwrap_or_default();
    let content = fs::read_to_string(&output_path).unwrap_or_default();
    let _ = fs::remove_file(&stderr_path);
    let _ = fs::remove_file(&output_path);

    if !status.success() {
        let detail = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("codex exec failed without stderr detail");
        return Err(format!("Codex seat failed: {detail}"));
    }

    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("Codex seat returned an empty response.".to_string());
    }
    Ok(content)
}

pub(crate) fn run_claude_print(
    binary: &Path,
    workdir: &Path,
    prompt: &str,
    cancel_requested: Arc<AtomicBool>,
) -> Result<String, String> {
    let mut child = Command::new(binary)
        .arg("-p")
        .arg("--bare")
        .arg("--no-session-persistence")
        .arg("--output-format")
        .arg("text")
        .current_dir(workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start claude -p: {error}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "Could not write prompt to claude -p.".to_string())?;
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|error| format!("Could not write Claude prompt: {error}"))?;
    }
    drop(child.stdin.take());

    let status = wait_for_child_with_cancel(&mut child, &cancel_requested, "Claude seat")?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Could not collect claude -p output: {error}"))?;

    if !status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("claude -p failed without stderr detail");
        return Err(format!("Claude seat failed: {detail}"));
    }

    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if content.is_empty() {
        return Err("Claude seat returned an empty response.".to_string());
    }
    Ok(content)
}

fn wait_for_child_with_cancel(
    child: &mut Child,
    cancel_requested: &AtomicBool,
    label: &str,
) -> Result<ExitStatus, String> {
    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{label} cancelled by user."));
        }
        match child
            .try_wait()
            .map_err(|error| format!("Could not wait for {label}: {error}"))?
        {
            Some(status) => return Ok(status),
            None => std::thread::sleep(Duration::from_millis(120)),
        }
    }
}

fn ensure_not_cancelled(cancel_requested: &AtomicBool) -> Result<(), String> {
    if cancel_requested.load(Ordering::SeqCst) {
        Err("Workflow run cancelled by user.".to_string())
    } else {
        Ok(())
    }
}

fn apply_output_to_run(
    run: &mut FlowRun,
    output: BridgeSeatOutput,
    agent_label: &str,
    elapsed_ms: Option<i64>,
) {
    if let Some(seat) = run
        .seats
        .iter_mut()
        .find(|seat| seat.seat_id == output.flow_seat_id)
    {
        seat.agent = agent_label.to_string();
        seat.role = output.role.to_string();
        seat.summary = compact(&output.content, 650);
        let mut evidence = vec![format!("Runner: {agent_label}")];
        if let Some(elapsed_ms) = elapsed_ms {
            evidence.push(format!("Duration: {}", duration_label(elapsed_ms)));
        }
        evidence.extend(evidence_from_output(&output.content));
        seat.evidence = evidence;
    }

    if output.flow_seat_id == "judge" {
        run.answer = compact(&output.content, 1_200);
        run.verdict = infer_verdict(&output.content, &run.verdict);
    }
}

fn runner_label(runner: &str) -> &'static str {
    match runner {
        "codex" => "Codex agent",
        "claude" => "Claude agent",
        "local" => "Local model",
        "system" => "System",
        "demo" => "Demo model",
        _ => "Assigned runner",
    }
}

pub fn duration_label(elapsed_ms: i64) -> String {
    if elapsed_ms >= 1_000 {
        format!("{:.1}s", elapsed_ms as f64 / 1_000.0)
    } else {
        format!("{elapsed_ms}ms")
    }
}

fn prior_outputs_for_assignment(run: &FlowRun, assignment_id: &str) -> Vec<String> {
    const ORDER: [(&str, &str); 5] = [
        ("brief", "brief"),
        ("scan", "researcher"),
        ("risk", "critic"),
        ("chair", "chair"),
        ("judge", "judge"),
    ];

    ORDER
        .iter()
        .take_while(|(candidate, _)| *candidate != assignment_id)
        .filter_map(|(_, flow_seat_id)| run.seats.iter().find(|seat| seat.seat_id == *flow_seat_id))
        .map(|seat| format!("{}: {}", seat.label, compact(&seat.summary, 900)))
        .collect()
}

pub(crate) fn evidence_from_output(content: &str) -> Vec<String> {
    let mut items: Vec<String> = content
        .lines()
        .map(|line| line.trim().trim_start_matches(['-', '*', '•', ' ']).trim())
        .filter(|line| !line.is_empty())
        .take(4)
        .map(|line| compact(line, 180))
        .collect();
    if items.is_empty() {
        items.push("The agent returned a response with no extractable evidence lines.".to_string());
    }
    items
}

pub(crate) fn compact(content: &str, max_chars: usize) -> String {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    let mut value = normalized
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    value.push('…');
    value
}

pub(crate) fn infer_verdict(content: &str, fallback: &str) -> String {
    let lower = content.to_lowercase();
    if lower.contains("escalate") {
        "ESCALATE".to_string()
    } else if lower.contains("revise") || lower.contains("do not") || lower.contains("blocked") {
        "REVISE".to_string()
    } else if lower.contains("approve") || lower.contains("go ahead") || lower.contains("proceed") {
        "APPROVE".to_string()
    } else {
        fallback.to_string()
    }
}

pub(crate) fn resolve_codex_binary() -> Option<PathBuf> {
    if let Some(path) = env::var_os("CODEX_BIN")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return Some(path);
    }

    let mut candidates = env::var_os("PATH")
        .map(|path_var| {
            env::split_paths(&path_var)
                .map(|dir| dir.join("codex"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/usr/bin/codex"),
    ]);

    candidates.into_iter().find(|candidate| candidate.is_file())
}

pub(crate) fn resolve_claude_binary() -> Option<PathBuf> {
    if let Some(path) = env::var_os("CLAUDE_BIN")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return Some(path);
    }

    let mut candidates = env::var_os("PATH")
        .map(|path_var| {
            env::split_paths(&path_var)
                .map(|dir| dir.join("claude"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".local/bin/claude"));
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
        PathBuf::from("/usr/bin/claude"),
    ]);

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn temp_file_path(prefix: &str, extension: &str) -> PathBuf {
    let nonce = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    );
    env::temp_dir().join(format!("{prefix}-{nonce}.{extension}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> ProjectRecord {
        ProjectRecord {
            id: "project-1".to_string(),
            name: "Example".to_string(),
            path: "/tmp/example".to_string(),
            agents: vec!["Codex".to_string()],
            status: "Active".to_string(),
            git: "Dirty".to_string(),
            risk: "Needs agent file".to_string(),
            confidence: 80,
            activity: "now".to_string(),
            next_task: "Review the bridge".to_string(),
            notes: "Local project.".to_string(),
            recent_files: vec!["src/App.tsx".to_string()],
            sessions: Vec::new(),
            readiness: crate::scan::ProjectReadiness::default(),
            last_scanned_ms: 100,
            last_modified_ms: Some(90),
        }
    }

    #[test]
    fn filters_codex_assigned_seats() {
        let assignments = SeatAssignments {
            brief: "system".to_string(),
            scan: "codex".to_string(),
            risk: "demo".to_string(),
            chair: "claude".to_string(),
            judge: "codex".to_string(),
        };
        let seats = codex_seats(&assignments);

        assert_eq!(seats.len(), 2);
        assert_eq!(seats[0].flow_seat_id, "researcher");
        assert_eq!(seats[1].flow_seat_id, "judge");
    }

    #[test]
    fn filters_claude_assigned_seats() {
        let assignments = SeatAssignments {
            brief: "claude".to_string(),
            scan: "codex".to_string(),
            risk: "claude".to_string(),
            chair: "demo".to_string(),
            judge: "claude".to_string(),
        };
        let seats = claude_seats(&assignments);

        assert_eq!(seats.len(), 3);
        assert_eq!(seats[0].flow_seat_id, "brief");
        assert_eq!(seats[1].flow_seat_id, "critic");
        assert_eq!(seats[2].flow_seat_id, "judge");
    }

    #[test]
    fn prior_outputs_follow_council_order() {
        let project = project();
        let mut run =
            crate::flow::build_example_flow(&project, "project-review", true, 123, "What next?");
        run.seats[1].summary = "Researcher output".to_string();
        run.seats[2].summary = "Critic output".to_string();

        let chair_prior = prior_outputs_for_assignment(&run, "chair");
        let judge_prior = prior_outputs_for_assignment(&run, "judge");

        assert!(chair_prior
            .iter()
            .any(|item| item.contains("Researcher output")));
        assert!(chair_prior
            .iter()
            .any(|item| item.contains("Critic output")));
        assert!(!chair_prior.iter().any(|item| item.starts_with("Chair:")));
        assert!(judge_prior.iter().any(|item| item.starts_with("Chair:")));
    }

    #[test]
    fn seat_prompt_enforces_read_only_constraints() {
        let project = project();
        let run =
            crate::flow::build_example_flow(&project, "project-review", true, 123, "What next?");
        let seat = all_council_seats().remove(1);
        let prompt = build_seat_prompt(&seat, &project, &run, &[]);

        assert!(prompt.contains("Work read-only"));
        assert!(prompt.contains("Do not edit"));
        assert!(prompt.contains("What next?"));
        assert!(prompt.contains("/tmp/example"));
        assert!(prompt.contains("Return exactly these sections"));
    }

    #[test]
    fn claude_print_sends_prompt_over_stdin_not_argv() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = tempfile::tempdir().unwrap();
        let script_path = temp_dir.path().join("fake-claude");
        fs::write(
            &script_path,
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "forecast-prompt-sentinel" ]; then
    echo "prompt leaked into argv" >&2
    exit 17
  fi
done
input="$(cat)"
if [ "$input" != "forecast-prompt-sentinel" ]; then
  echo "stdin mismatch: $input" >&2
  exit 18
fi
printf "received prompt from stdin"
"#,
        )
        .unwrap();
        let mut permissions = fs::metadata(&script_path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions).unwrap();

        let output = run_claude_print(
            &script_path,
            temp_dir.path(),
            "forecast-prompt-sentinel",
            Arc::new(AtomicBool::new(false)),
        )
        .expect("Claude prompt should be supplied on stdin");

        assert_eq!(output, "received prompt from stdin");
    }

    #[test]
    fn applies_judge_output_to_run() {
        let project = project();
        let mut run =
            crate::flow::build_example_flow(&project, "project-review", true, 123, "What next?");
        apply_output_to_run(
            &mut run,
            BridgeSeatOutput {
                flow_seat_id: "judge",
                role: "Decision",
                content: "Summary: approve this constrained move.\nEvidence: tests pass.\nRecommendation: proceed.".to_string(),
            },
            "Codex agent",
            Some(1_420),
        );

        assert_eq!(run.verdict, "APPROVE");
        assert!(run.answer.contains("approve"));
        assert_eq!(run.seats[4].agent, "Codex agent");
        assert!(run.seats[4]
            .evidence
            .iter()
            .any(|item| item == "Duration: 1.4s"));
    }

    #[test]
    fn formats_short_and_long_durations() {
        assert_eq!(duration_label(820), "820ms");
        assert_eq!(duration_label(1_450), "1.4s");
    }
}
