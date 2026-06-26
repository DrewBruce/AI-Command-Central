use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::codex_bridge::{self, ClaudeBridgeStatus, CodexBridgeStatus, SeatAssignments};
use crate::db::{self, CustomAgentRecord, CustomWorkflowRecord, Db, ProjectRecord, ScanPath};
use crate::flow::{self, FlowRun};
use crate::launch;
use crate::provider::{self, ProviderAnswer, ProviderConfig};
use crate::scan;
use crate::workflow_runner;

#[derive(Default)]
pub struct ScanState(pub AtomicBool);

#[derive(Clone, Default)]
pub struct FlowRunState {
    cancel_requested: Arc<AtomicBool>,
}

impl FlowRunState {
    fn reset(&self) {
        self.cancel_requested.store(false, Ordering::SeqCst);
    }

    fn cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    fn token(&self) -> Arc<AtomicBool> {
        self.cancel_requested.clone()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub backend: String,
    pub db_path: String,
    pub project_count: i64,
    pub scan_path_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub projects_found: usize,
    pub roots_scanned: usize,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFilePreview {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub file_path: String,
    pub exists: bool,
    pub content: String,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileWriteResult {
    pub project: ProjectRecord,
    pub file_path: String,
    pub bytes_written: usize,
}

#[tauri::command]
pub fn app_status(app: AppHandle, db: State<'_, Db>) -> Result<AppStatus, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ai-command-central.sqlite");
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    Ok(AppStatus {
        backend: "tauri-sqlite".to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        project_count: db::project_count(&conn).map_err(|error| error.to_string())?,
        scan_path_count: db::scan_path_count(&conn).map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
pub fn list_projects(db: State<'_, Db>) -> Result<Vec<ProjectRecord>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::list_projects(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_scan_paths(db: State<'_, Db>) -> Result<Vec<ScanPath>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::scan_paths(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn scan_projects(
    db: State<'_, Db>,
    scan_state: State<'_, ScanState>,
) -> Result<ScanResult, String> {
    if scan_state
        .0
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("scan already running".to_string());
    }

    let result = scan_projects_inner(&db);
    scan_state.0.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub async fn run_example_flow(
    app: AppHandle,
    db: State<'_, Db>,
    flow_state: State<'_, FlowRunState>,
    project_id: String,
    workflow_id: String,
    live: bool,
    prompt: String,
    seat_assignments: Option<SeatAssignments>,
) -> Result<FlowRun, String> {
    let started = scan::now_ms();
    flow_state.reset();
    let cancel_token = flow_state.token();
    let seat_assignments = seat_assignments.unwrap_or_default();
    let (project, provider_config) = {
        let conn = db.0.lock().map_err(|error| error.to_string())?;
        let project = db::project_by_id(&conn, &project_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "unknown project".to_string())?;
        let provider_config = db::provider_config(&conn).map_err(|error| error.to_string())?;
        (project, provider_config)
    };

    let mut run = flow::build_example_flow(&project, &workflow_id, live, started, &prompt);
    let mut completed_node_ids = Vec::<String>::new();
    if live {
        codex_bridge::apply_cli_seats(
            &app,
            &mut run,
            &seat_assignments,
            &project,
            &mut completed_node_ids,
            cancel_token.clone(),
        )
        .await?;
        if seat_assignments.judge_is_local() {
            ensure_run_not_cancelled(&cancel_token)?;
            codex_bridge::emit_flow_progress(
                &app,
                &run.id,
                "judge",
                "started",
                "Judge running",
                "Local model provider is executing the Judge seat.",
                &completed_node_ids,
                None,
            );
            let provider_started = Instant::now();
            let answer = provider::ask_provider(&provider_config, &project, &run.prompt).await?;
            ensure_run_not_cancelled(&cancel_token)?;
            let elapsed_ms = provider_started.elapsed().as_millis().min(i64::MAX as u128) as i64;
            apply_provider_answer(&mut run, answer, Some(elapsed_ms));
            codex_bridge::mark_node_completed(&mut completed_node_ids, "judge");
            codex_bridge::emit_flow_progress(
                &app,
                &run.id,
                "judge",
                "completed",
                "Judge complete",
                format!(
                    "Local model provider finished Judge in {}.",
                    codex_bridge::duration_label(elapsed_ms)
                ),
                &completed_node_ids,
                Some(elapsed_ms),
            );
        }
    }

    if live {
        codex_bridge::emit_flow_progress(
            &app,
            &run.id,
            "save",
            "started",
            "Saving report",
            "Writing the completed Council report to local history.",
            &completed_node_ids,
            None,
        );
    }
    let save_started = Instant::now();
    run.finished_ms = scan::now_ms();
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::save_flow_run(&conn, &run).map_err(|error| error.to_string())?;
    save_run_artifacts(&app, &run)?;
    let save_elapsed_ms = save_started.elapsed().as_millis().min(i64::MAX as u128) as i64;
    run.finished_ms = scan::now_ms();
    if live {
        codex_bridge::mark_node_completed(&mut completed_node_ids, "save");
        codex_bridge::emit_flow_progress(
            &app,
            &run.id,
            "save",
            "completed",
            "Run saved",
            format!(
                "Saved the Council report in {}.",
                codex_bridge::duration_label(save_elapsed_ms)
            ),
            &completed_node_ids,
            Some(save_elapsed_ms),
        );
    }
    Ok(run)
}

#[tauri::command]
pub async fn run_custom_workflow(
    app: AppHandle,
    db: State<'_, Db>,
    flow_state: State<'_, FlowRunState>,
    project_id: String,
    workflow: CustomWorkflowRecord,
    live: bool,
    prompt: String,
    agents: Vec<CustomAgentRecord>,
) -> Result<FlowRun, String> {
    let started = scan::now_ms();
    flow_state.reset();
    let cancel_token = flow_state.token();
    let (project, provider_config) = {
        let conn = db.0.lock().map_err(|error| error.to_string())?;
        let project = db::project_by_id(&conn, &project_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "unknown project".to_string())?;
        let provider_config = db::provider_config(&conn).map_err(|error| error.to_string())?;
        (project, provider_config)
    };

    let mut run = workflow_runner::run_custom_workflow(
        &app,
        &workflow,
        &agents,
        &project,
        &provider_config,
        live,
        &prompt,
        started,
        cancel_token,
    )
    .await?;

    let completed_node_ids = run
        .seats
        .iter()
        .map(|seat| seat.seat_id.clone())
        .collect::<Vec<_>>();
    if live {
        codex_bridge::emit_flow_progress(
            &app,
            &run.id,
            "save",
            "started",
            "Saving report",
            "Writing the completed custom workflow report to local history.",
            &completed_node_ids,
            None,
        );
    }
    let save_started = Instant::now();
    run.finished_ms = scan::now_ms();
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::save_flow_run(&conn, &run).map_err(|error| error.to_string())?;
    save_run_artifacts(&app, &run)?;
    let save_elapsed_ms = save_started.elapsed().as_millis().min(i64::MAX as u128) as i64;
    run.finished_ms = scan::now_ms();
    if live {
        let mut completed_with_save = completed_node_ids;
        codex_bridge::mark_node_completed(&mut completed_with_save, "save");
        codex_bridge::emit_flow_progress(
            &app,
            &run.id,
            "save",
            "completed",
            "Run saved",
            format!(
                "Saved the custom workflow report in {}.",
                codex_bridge::duration_label(save_elapsed_ms)
            ),
            &completed_with_save,
            Some(save_elapsed_ms),
        );
    }

    Ok(run)
}

#[tauri::command]
pub fn cancel_current_flow(flow_state: State<'_, FlowRunState>) -> Result<(), String> {
    flow_state.cancel();
    Ok(())
}

fn ensure_run_not_cancelled(cancel_requested: &AtomicBool) -> Result<(), String> {
    if cancel_requested.load(Ordering::SeqCst) {
        Err("Workflow run cancelled by user.".to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn list_flow_runs(db: State<'_, Db>, limit: Option<i64>) -> Result<Vec<FlowRun>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::list_flow_runs(&conn, limit.unwrap_or(20).clamp(1, 100)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_custom_workflows(db: State<'_, Db>) -> Result<Vec<CustomWorkflowRecord>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::list_custom_workflows(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_custom_workflow(
    db: State<'_, Db>,
    workflow: CustomWorkflowRecord,
) -> Result<CustomWorkflowRecord, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::save_custom_workflow(&conn, &workflow, scan::now_ms())
        .map_err(|error| error.to_string())?;
    Ok(workflow)
}

#[tauri::command]
pub fn delete_custom_workflow(db: State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::delete_custom_workflow(&conn, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_custom_agents(db: State<'_, Db>) -> Result<Vec<CustomAgentRecord>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::list_custom_agents(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_custom_agent(
    db: State<'_, Db>,
    agent: CustomAgentRecord,
) -> Result<CustomAgentRecord, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::save_custom_agent(&conn, &agent, scan::now_ms()).map_err(|error| error.to_string())?;
    Ok(agent)
}

#[tauri::command]
pub fn delete_custom_agent(db: State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::delete_custom_agent(&conn, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_run_artifact_folder(app: AppHandle, run_id: String) -> Result<(), String> {
    let folder = run_artifact_dir(&app, &run_id)?;
    if !folder.is_dir() {
        return Err("Artifact folder has not been created for this run yet.".to_string());
    }
    launch::open_folder(&folder)
}

#[tauri::command]
pub fn codex_bridge_status() -> CodexBridgeStatus {
    codex_bridge::status()
}

#[tauri::command]
pub fn claude_bridge_status() -> ClaudeBridgeStatus {
    codex_bridge::claude_status()
}

#[tauri::command]
pub fn provider_config(db: State<'_, Db>) -> Result<ProviderConfig, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::provider_config(&conn).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_provider_config(
    db: State<'_, Db>,
    config: ProviderConfig,
) -> Result<ProviderConfig, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::save_provider_config(&conn, config, scan::now_ms()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn provider_endpoint_status(
    config: ProviderConfig,
) -> Result<provider::ProviderEndpointStatus, String> {
    Ok(provider::check_local_provider_status(&config).await)
}

#[tauri::command]
pub async fn list_ollama_models(config: ProviderConfig) -> Result<Vec<String>, String> {
    provider::list_local_models(&config).await
}

#[tauri::command]
pub fn preview_agent_file(
    db: State<'_, Db>,
    project_id: String,
) -> Result<AgentFilePreview, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    let project = db::project_by_id(&conn, &project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "unknown project".to_string())?;
    Ok(build_agent_file_preview(&project))
}

#[tauri::command]
pub fn write_agent_file(
    db: State<'_, Db>,
    project_id: String,
    content: String,
) -> Result<AgentFileWriteResult, String> {
    let mut conn = db.0.lock().map_err(|error| error.to_string())?;
    let project = db::project_by_id(&conn, &project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "unknown project".to_string())?;
    let file_path = agent_file_path(&project);

    if file_path.exists() {
        return Err("AGENTS.md already exists; refusing to overwrite it.".to_string());
    }

    if content.trim().is_empty() {
        return Err("AGENTS.md content is empty; nothing was written.".to_string());
    }

    std::fs::write(&file_path, &content).map_err(|error| error.to_string())?;
    let scanned = scan::scan_project(&PathBuf::from(&project.path))
        .ok_or_else(|| "created AGENTS.md, but project could not be rescanned".to_string())?;
    db::upsert_projects(&mut conn, &[scanned]).map_err(|error| error.to_string())?;
    let updated = db::project_by_id(&conn, &project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "created AGENTS.md, but updated project was not found".to_string())?;

    Ok(AgentFileWriteResult {
        project: updated,
        file_path: file_path.to_string_lossy().to_string(),
        bytes_written: content.len(),
    })
}

fn scan_projects_inner(db: &State<'_, Db>) -> Result<ScanResult, String> {
    let started = scan::now_ms();
    let roots: Vec<PathBuf> = {
        let conn = db.0.lock().map_err(|error| error.to_string())?;
        db::enabled_roots(&conn).map_err(|error| error.to_string())?
    };
    let projects = scan::scan_roots(&roots, 5);
    let finished = scan::now_ms();

    {
        let mut conn = db.0.lock().map_err(|error| error.to_string())?;
        db::upsert_projects(&mut conn, &projects).map_err(|error| error.to_string())?;
        db::save_scan_run(&conn, started, finished, roots.len(), projects.len())
            .map_err(|error| error.to_string())?;
    }

    Ok(ScanResult {
        projects_found: projects.len(),
        roots_scanned: roots.len(),
        duration_ms: finished - started,
    })
}

fn apply_provider_answer(run: &mut FlowRun, answer: ProviderAnswer, elapsed_ms: Option<i64>) {
    run.mode = "Live".to_string();
    run.answer = answer.content.clone();
    run.finished_ms = scan::now_ms();
    run.summary = format!(
        "Live provider answered the Council question using {} · {}. {}",
        answer.provider_label, answer.model, run.guardrail
    );
    run.sources
        .insert(0, format!("{} · {}", answer.provider_label, answer.model));
    run.caveats.insert(
        0,
        "Live local model output is generated from the configured endpoint; verify important claims."
            .to_string(),
    );
    run.assumptions
        .insert(0, "The configured local model can answer from the supplied Council question and context packet.".to_string());

    for seat in &mut run.seats {
        match seat.seat_id.as_str() {
            "researcher" => {
                seat.summary = format!(
                    "Called {} using {} with the Council question and local context packet.",
                    answer.provider_label, answer.model
                );
                seat.evidence = vec![
                    "Endpoint: OpenAI-compatible chat completions".to_string(),
                    format!("Model: {}", answer.model),
                    "Context: question, project path, git state, risk, next task, recent files"
                        .to_string(),
                ];
            }
            "judge" => {
                seat.summary = answer.content.clone();
                let mut evidence = vec![
                    format!("Runner: {} · {}", answer.provider_label, answer.model),
                    format!(
                        "Decision basis: {} · {}",
                        answer.provider_label, answer.model
                    ),
                ];
                if let Some(elapsed_ms) = elapsed_ms {
                    evidence.insert(
                        1,
                        format!("Duration: {}", codex_bridge::duration_label(elapsed_ms)),
                    );
                }
                seat.evidence = evidence;
            }
            _ => {}
        }
    }
}

fn run_artifact_dir(app: &AppHandle, run_id: &str) -> Result<PathBuf, String> {
    let safe_id = safe_artifact_segment(run_id);
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("run-artifacts")
        .join(safe_id))
}

fn save_run_artifacts(app: &AppHandle, run: &FlowRun) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("run-artifacts");
    save_run_artifacts_to_root(&root, run)
}

pub(crate) fn save_run_artifacts_to_root(root: &Path, run: &FlowRun) -> Result<PathBuf, String> {
    let dir = root.join(safe_artifact_segment(&run.id));
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let json = serde_json::to_string_pretty(run).map_err(|error| error.to_string())?;
    std::fs::write(dir.join("run.json"), json).map_err(|error| error.to_string())?;
    std::fs::write(dir.join("report_manifest.json"), flow_run_manifest(run)?)
        .map_err(|error| error.to_string())?;
    std::fs::write(dir.join("report.md"), flow_run_markdown(run))
        .map_err(|error| error.to_string())?;
    std::fs::write(dir.join("report.html"), flow_run_html(run))
        .map_err(|error| error.to_string())?;
    Ok(dir)
}

fn safe_artifact_segment(value: &str) -> String {
    let segment = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if segment.is_empty() {
        "run".to_string()
    } else {
        segment
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportManifest {
    format_version: &'static str,
    run_id: String,
    workflow_id: String,
    workflow_name: String,
    project_name: String,
    generated_by: &'static str,
    local_report_writer: bool,
    source_artifact: &'static str,
    artifacts: Vec<ReportArtifact>,
    sections: Vec<ReportSection>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportArtifact {
    kind: &'static str,
    path: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportSection {
    id: String,
    title: String,
    kind: &'static str,
    source: String,
}

fn flow_run_manifest(run: &FlowRun) -> Result<String, String> {
    let mut sections = vec![
        ReportSection {
            id: "question".to_string(),
            title: "Council Question".to_string(),
            kind: "text",
            source: "run.prompt".to_string(),
        },
        ReportSection {
            id: "answer".to_string(),
            title: "Council Answer".to_string(),
            kind: "text",
            source: "run.answer".to_string(),
        },
        ReportSection {
            id: "guardrail".to_string(),
            title: "Project Guardrail".to_string(),
            kind: "text",
            source: "run.guardrail".to_string(),
        },
        ReportSection {
            id: "summary".to_string(),
            title: "Summary".to_string(),
            kind: "text",
            source: "run.summary".to_string(),
        },
        ReportSection {
            id: "assumptions".to_string(),
            title: "Assumptions".to_string(),
            kind: "list",
            source: "run.assumptions".to_string(),
        },
        ReportSection {
            id: "sources".to_string(),
            title: "Inputs and Evidence".to_string(),
            kind: "list",
            source: "run.sources".to_string(),
        },
        ReportSection {
            id: "caveats".to_string(),
            title: "Caveats".to_string(),
            kind: "list",
            source: "run.caveats".to_string(),
        },
    ];

    sections.extend(run.seats.iter().map(|seat| ReportSection {
        id: format!("seat-{}", safe_artifact_segment(&seat.seat_id)),
        title: seat.label.clone(),
        kind: "seat-output",
        source: format!("run.seats.{}", seat.seat_id),
    }));

    let manifest = ReportManifest {
        format_version: "1",
        run_id: run.id.clone(),
        workflow_id: run.workflow_id.clone(),
        workflow_name: run.workflow_name.clone(),
        project_name: run.project_name.clone(),
        generated_by: "AI Command Central local report writer",
        local_report_writer: true,
        source_artifact: "run.json",
        artifacts: vec![
            ReportArtifact {
                kind: "source",
                path: "run.json",
            },
            ReportArtifact {
                kind: "manifest",
                path: "report_manifest.json",
            },
            ReportArtifact {
                kind: "markdown",
                path: "report.md",
            },
            ReportArtifact {
                kind: "html",
                path: "report.html",
            },
        ],
        sections,
    };

    serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())
}

fn flow_run_markdown(run: &FlowRun) -> String {
    let mut output = String::new();
    let _ = writeln!(output, "# {}", run.workflow_name);
    let _ = writeln!(output);
    let _ = writeln!(output, "- Project: {}", run.project_name);
    let _ = writeln!(output, "- Mode: {}", run.mode);
    let _ = writeln!(output, "- Verdict: {}", run.verdict);
    let _ = writeln!(output, "- Confidence: {}%", run.confidence);
    let _ = writeln!(
        output,
        "- Duration: {}",
        codex_bridge::duration_label((run.finished_ms - run.started_ms).max(0))
    );
    let _ = writeln!(output);
    markdown_section(&mut output, "Council Question", &[run.prompt.clone()]);
    markdown_section(&mut output, "Council Answer", &[run.answer.clone()]);
    markdown_section(&mut output, "Project Guardrail", &[run.guardrail.clone()]);
    markdown_section(&mut output, "Summary", &[run.summary.clone()]);
    markdown_list(&mut output, "Assumptions", &run.assumptions);
    markdown_list(&mut output, "Inputs and Evidence", &run.sources);
    markdown_list(&mut output, "Caveats", &run.caveats);
    let _ = writeln!(output, "## Seats");
    let _ = writeln!(output);
    for seat in &run.seats {
        let _ = writeln!(output, "### {}", seat.label);
        let _ = writeln!(output);
        let _ = writeln!(output, "- Runner: {}", seat.agent);
        let _ = writeln!(output, "- Role: {}", seat.role);
        let _ = writeln!(output, "- Status: {}", seat.status);
        let _ = writeln!(output);
        let _ = writeln!(output, "{}", seat.summary);
        let _ = writeln!(output);
        if !seat.evidence.is_empty() {
            let _ = writeln!(output, "Evidence:");
            for item in &seat.evidence {
                let _ = writeln!(output, "- {}", item);
            }
            let _ = writeln!(output);
        }
    }
    output
}

fn markdown_section(output: &mut String, title: &str, values: &[String]) {
    let _ = writeln!(output, "## {title}");
    let _ = writeln!(output);
    for value in values {
        let _ = writeln!(output, "{value}");
        let _ = writeln!(output);
    }
}

fn markdown_list(output: &mut String, title: &str, items: &[String]) {
    let _ = writeln!(output, "## {title}");
    let _ = writeln!(output);
    if items.is_empty() {
        let _ = writeln!(output, "- No entries recorded.");
    } else {
        for item in items {
            let _ = writeln!(output, "- {item}");
        }
    }
    let _ = writeln!(output);
}

fn flow_run_html(run: &FlowRun) -> String {
    let seats = run
        .seats
        .iter()
        .map(|seat| {
            format!(
                "<article><h3>{}</h3><p><strong>{}</strong> · {}</p><p>{}</p>{}</article>",
                html_escape(&seat.label),
                html_escape(&seat.agent),
                html_escape(&seat.role),
                html_escape(&seat.summary),
                html_list(&seat.evidence)
            )
        })
        .collect::<String>();

    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{title}</title><style>{css}</style></head><body><main><header><p>{mode} · {project} · {duration}</p><h1>{title}</h1><span>Verdict: {verdict}</span></header><section><h2>Council Question</h2><p>{question}</p></section><section class=\"answer\"><h2>Council Answer</h2><p>{answer}</p></section><section><h2>Project Guardrail</h2><p>{guardrail}</p></section><section><h2>Summary</h2><p>{summary}</p></section><div class=\"grid\"><section><h2>Assumptions</h2>{assumptions}</section><section><h2>Inputs and Evidence</h2>{sources}</section><section><h2>Caveats</h2>{caveats}</section></div><section><h2>Seats</h2><div class=\"seats\">{seats}</div></section></main></body></html>",
        title = html_escape(&run.workflow_name),
        mode = html_escape(&run.mode),
        project = html_escape(&run.project_name),
        duration = html_escape(&codex_bridge::duration_label((run.finished_ms - run.started_ms).max(0))),
        verdict = html_escape(&run.verdict),
        question = html_escape(&run.prompt),
        answer = html_escape(&run.answer),
        guardrail = html_escape(&run.guardrail),
        summary = html_escape(&run.summary),
        assumptions = html_list(&run.assumptions),
        sources = html_list(&run.sources),
        caveats = html_list(&run.caveats),
        seats = seats,
        css = artifact_css()
    )
}

fn html_list(items: &[String]) -> String {
    if items.is_empty() {
        return "<ul><li>No entries recorded.</li></ul>".to_string();
    }
    let items = items
        .iter()
        .map(|item| format!("<li>{}</li>", html_escape(item)))
        .collect::<String>();
    format!("<ul>{items}</ul>")
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn artifact_css() -> &'static str {
    "body{margin:0;background:#071016;color:#e7edf4;font:15px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 22px 56px}header{border:1px solid #264454;background:#0d1b24;border-radius:12px;padding:22px}header p{margin:0 0 8px;color:#93a5b7}header h1{margin:0 0 14px;font-size:32px}header span{display:inline-block;border:1px solid #5fd2e8;border-radius:999px;padding:6px 10px;color:#6be6ff;font-weight:700}section{margin-top:18px;border:1px solid #1d3340;background:#0a141c;border-radius:10px;padding:18px}.answer{background:#0d211c;border-color:#315a48}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.seats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}article{border:1px solid #203644;background:#081119;border-radius:10px;padding:14px}h2{margin:0 0 10px;font-size:16px}h3{margin:0 0 8px}ul{margin:0;padding-left:18px}@media(max-width:760px){.grid{grid-template-columns:1fr}main{padding:18px 12px}header h1{font-size:24px}}"
}

fn agent_file_path(project: &ProjectRecord) -> PathBuf {
    PathBuf::from(&project.path).join("AGENTS.md")
}

fn build_agent_file_preview(project: &ProjectRecord) -> AgentFilePreview {
    let content = agent_file_content(project);
    let file_path = agent_file_path(project);
    AgentFilePreview {
        project_id: project.id.clone(),
        project_name: project.name.clone(),
        project_path: project.path.clone(),
        file_path: file_path.to_string_lossy().to_string(),
        exists: file_path.is_file(),
        line_count: content.trim_end().lines().count(),
        content,
    }
}

fn agent_file_content(project: &ProjectRecord) -> String {
    let agents = if project.agents.is_empty() {
        "None detected yet".to_string()
    } else {
        project.agents.join(", ")
    };
    format!(
        "# AGENTS.md\n\
\n\
## Project\n\
- Name: {name}\n\
- Path: {path}\n\
- Current git state: {git}\n\
- Current risk: {risk}\n\
- Next task: {next_task}\n\
- Detected agents: {agents}\n\
\n\
## Local-First Rules\n\
- Keep project context local unless Drew explicitly approves sharing it.\n\
- Read existing docs and recent files before changing code.\n\
- Do not run destructive git, file, package, or database commands without explicit approval.\n\
- Do not inspect or print secrets from env files, keychains, tokens, or private config.\n\
- Prefer small, reviewable changes with clear verification steps.\n\
\n\
## Workflow\n\
- Start by summarizing the requested outcome and the files likely to matter.\n\
- Check the app's existing patterns before adding abstractions.\n\
- Run the narrowest useful build, lint, or test command after edits.\n\
- Report what changed, what was verified, and any remaining risk.\n\
\n\
## Handoff Notes\n\
- Use this file as the local agent context for Codex, Claude, and other coding agents.\n\
- Keep future project-specific rules in this file so handoffs stay consistent.\n",
        name = project.name,
        path = project.path,
        git = project.git,
        risk = project.risk,
        next_task = project.next_task,
        agents = agents
    )
}

#[tauri::command]
pub fn open_project(db: State<'_, Db>, id: String) -> Result<(), String> {
    let path = project_path(&db, &id)?;
    launch::open_folder(&path)
}

#[tauri::command]
pub fn open_terminal(db: State<'_, Db>, id: String) -> Result<(), String> {
    let path = project_path(&db, &id)?;
    launch::open_terminal(&path)
}

fn project_path(db: &State<'_, Db>, id: &str) -> Result<PathBuf, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    db::project_path(&conn, id)
        .map_err(|error| error.to_string())?
        .map(PathBuf::from)
        .ok_or_else(|| "unknown project".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> ProjectRecord {
        ProjectRecord {
            id: "project-1".to_string(),
            name: "NoAgent".to_string(),
            path: "/tmp/no-agent".to_string(),
            agents: Vec::new(),
            status: "Active".to_string(),
            git: "Dirty".to_string(),
            risk: "Needs agent file".to_string(),
            confidence: 72,
            activity: "just now".to_string(),
            next_task: "Create an agent context file so tools know project rules".to_string(),
            notes: "Detected from repository markers.".to_string(),
            recent_files: vec!["package.json".to_string()],
            sessions: Vec::new(),
            last_scanned_ms: 100,
            last_modified_ms: Some(90),
        }
    }

    #[test]
    fn agent_file_preview_contains_local_first_guardrails() {
        let preview = build_agent_file_preview(&project());

        assert!(preview.file_path.ends_with("/tmp/no-agent/AGENTS.md"));
        assert!(preview.content.contains("# AGENTS.md"));
        assert!(preview.content.contains("Keep project context local"));
        assert!(preview.content.contains("Do not run destructive git"));
        assert!(preview.content.contains("Current risk: Needs agent file"));
        assert!(preview.line_count > 10);
    }

    #[test]
    fn run_artifacts_are_saved_as_markdown_html_and_json() {
        let temp_dir = tempfile::tempdir().unwrap();
        let run = FlowRun {
            id: "flow:test/1".to_string(),
            workflow_id: "workflow-1".to_string(),
            workflow_name: "Artifact Test".to_string(),
            project_id: "project-1".to_string(),
            project_name: "Project One".to_string(),
            prompt: "What should happen next?".to_string(),
            answer: "Proceed with a narrow test.".to_string(),
            guardrail: "No guardrail issue.".to_string(),
            assumptions: vec!["A clear prompt exists.".to_string()],
            sources: vec!["Test source".to_string()],
            caveats: vec!["Verify before acting.".to_string()],
            confidence: 84,
            mode: "Live".to_string(),
            status: "Completed".to_string(),
            started_ms: 1_000,
            finished_ms: 2_250,
            summary: "Saved artifact report.".to_string(),
            verdict: "APPROVE".to_string(),
            seats: vec![crate::flow::FlowSeatResult {
                seat_id: "judge".to_string(),
                label: "Judge".to_string(),
                agent: "Codex agent".to_string(),
                role: "Decision".to_string(),
                status: "done".to_string(),
                summary: "Approved the narrow test.".to_string(),
                evidence: vec!["Duration: 1.2s".to_string()],
            }],
        };

        let folder = save_run_artifacts_to_root(temp_dir.path(), &run).unwrap();

        assert!(folder.ends_with("flow-test-1"));
        assert!(folder.join("run.json").is_file());
        assert!(folder.join("report_manifest.json").is_file());
        assert!(folder.join("report.md").is_file());
        assert!(folder.join("report.html").is_file());
        let manifest = std::fs::read_to_string(folder.join("report_manifest.json")).unwrap();
        let markdown = std::fs::read_to_string(folder.join("report.md")).unwrap();
        let html = std::fs::read_to_string(folder.join("report.html")).unwrap();
        assert!(manifest.contains("\"formatVersion\""));
        assert!(manifest.contains("\"localReportWriter\""));
        assert!(manifest.contains("\"report.html\""));
        assert!(markdown.contains("# Artifact Test"));
        assert!(markdown.contains("## Council Answer"));
        assert!(html.contains("Artifact Test"));
        assert!(html.contains("Proceed with a narrow test."));
    }
}
