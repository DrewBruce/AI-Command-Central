use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::flow::FlowRun;
use crate::provider::{self, ProviderConfig};
use crate::scan::{DetectedProject, SessionSummary};

pub struct Db(pub Mutex<Connection>);

const SCHEMA_VERSION: i64 = 7;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
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
    pub last_scanned_ms: i64,
    pub last_modified_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPath {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNodeRecord {
    pub id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub kind: String,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default, rename = "function")]
    pub function_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomWorkflowRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub seats: i64,
    pub run_time: String,
    pub recommended_for: String,
    pub nodes: Vec<WorkflowNodeRecord>,
    pub edges: Vec<[String; 2]>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgentRecord {
    pub id: String,
    pub name: String,
    pub role: String,
    pub model: String,
    pub authority: String,
    pub default_tools: Vec<String>,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub skill_ref: Option<String>,
    #[serde(default)]
    pub prompt_ref: Option<String>,
    #[serde(default)]
    pub web_search: Option<bool>,
    #[serde(default)]
    pub output_format: Option<String>,
    #[serde(default)]
    pub local_fit: Option<String>,
}

pub fn project_id(canonical_path: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in canonical_path.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    seed_defaults(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS scan_paths (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          agents_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL,
          git TEXT NOT NULL,
          risk TEXT NOT NULL,
          confidence INTEGER NOT NULL,
          activity TEXT NOT NULL,
          next_task TEXT NOT NULL,
          notes TEXT NOT NULL,
          recent_files_json TEXT NOT NULL DEFAULT '[]',
          sessions_json TEXT NOT NULL DEFAULT '[]',
          last_scanned_ms INTEGER NOT NULL,
          last_modified_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS scan_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_ms INTEGER NOT NULL,
          finished_ms INTEGER NOT NULL,
          roots_scanned INTEGER NOT NULL,
          projects_found INTEGER NOT NULL,
          status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS flow_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          project_name TEXT NOT NULL,
          workflow_id TEXT NOT NULL,
          workflow_name TEXT NOT NULL,
          prompt TEXT NOT NULL DEFAULT '',
          answer TEXT NOT NULL DEFAULT '',
          guardrail TEXT NOT NULL DEFAULT '',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          sources_json TEXT NOT NULL DEFAULT '[]',
          caveats_json TEXT NOT NULL DEFAULT '[]',
          confidence INTEGER NOT NULL DEFAULT 70,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          started_ms INTEGER NOT NULL,
          finished_ms INTEGER NOT NULL,
          summary TEXT NOT NULL,
          verdict TEXT NOT NULL,
          seats_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          mode TEXT NOT NULL,
          local_base_url TEXT NOT NULL,
          local_model TEXT NOT NULL,
          external_provider TEXT NOT NULL,
          external_model TEXT NOT NULL,
          api_key_stored INTEGER NOT NULL DEFAULT 0,
          updated_ms INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS custom_workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          workflow_json TEXT NOT NULL,
          updated_ms INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS custom_agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          model TEXT NOT NULL,
          authority TEXT NOT NULL,
          agent_json TEXT NOT NULL,
          updated_ms INTEGER NOT NULL DEFAULT 0
        );
        ",
    )?;
    ensure_flow_run_columns(conn)?;
    ensure_provider_config(conn)?;
    ensure_custom_library_tables(conn)?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn ensure_flow_run_columns(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(flow_runs)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let columns = columns.collect::<rusqlite::Result<Vec<_>>>()?;
    if !columns.iter().any(|column| column == "prompt") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN prompt TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "answer") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN answer TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "guardrail") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN guardrail TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "assumptions_json") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN assumptions_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "sources_json") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "caveats_json") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN caveats_json TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "confidence") {
        conn.execute(
            "ALTER TABLE flow_runs ADD COLUMN confidence INTEGER NOT NULL DEFAULT 70",
            [],
        )?;
    }
    Ok(())
}

fn ensure_provider_config(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS provider_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          mode TEXT NOT NULL,
          local_base_url TEXT NOT NULL,
          local_model TEXT NOT NULL,
          external_provider TEXT NOT NULL,
          external_model TEXT NOT NULL,
          api_key_stored INTEGER NOT NULL DEFAULT 0,
          updated_ms INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    let defaults = ProviderConfig::default();
    conn.execute(
        "INSERT OR IGNORE INTO provider_config
          (id, mode, local_base_url, local_model, external_provider, external_model, api_key_stored, updated_ms)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, 0, 0)",
        rusqlite::params![
            defaults.mode,
            defaults.local_base_url,
            defaults.local_model,
            defaults.external_provider,
            defaults.external_model,
        ],
    )?;
    Ok(())
}

fn ensure_custom_library_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          workflow_json TEXT NOT NULL,
          updated_ms INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          model TEXT NOT NULL,
          authority TEXT NOT NULL,
          agent_json TEXT NOT NULL,
          updated_ms INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    Ok(())
}

fn seed_defaults(conn: &Connection) -> rusqlite::Result<()> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        PathBuf::from(&home).join("code"),
        PathBuf::from(&home).join("Sites"),
        PathBuf::from(&home).join("Documents"),
    ];

    for path in candidates.iter().filter(|path| path.is_dir()) {
        conn.execute(
            "INSERT OR IGNORE INTO scan_paths (path, enabled) VALUES (?1, 1)",
            [path.to_string_lossy().to_string()],
        )?;
    }
    Ok(())
}

pub fn scan_paths(conn: &Connection) -> rusqlite::Result<Vec<ScanPath>> {
    let mut stmt = conn.prepare("SELECT id, path, enabled FROM scan_paths ORDER BY path")?;
    let rows = stmt.query_map([], |row| {
        Ok(ScanPath {
            id: row.get(0)?,
            path: row.get(1)?,
            enabled: row.get::<_, i64>(2)? != 0,
        })
    })?;
    rows.collect()
}

pub fn enabled_roots(conn: &Connection) -> rusqlite::Result<Vec<PathBuf>> {
    Ok(scan_paths(conn)?
        .into_iter()
        .filter(|row| row.enabled)
        .map(|row| PathBuf::from(row.path))
        .collect())
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<ProjectRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, agents_json, status, git, risk, confidence, activity,
                next_task, notes, recent_files_json, sessions_json, last_scanned_ms,
                last_modified_ms
         FROM projects
         ORDER BY
           CASE risk
             WHEN 'Secret flagged' THEN 0
             WHEN 'Needs agent file' THEN 1
             WHEN 'Review' THEN 2
             ELSE 3
           END,
           confidence DESC,
           name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let agents_json: String = row.get(3)?;
        let recent_files_json: String = row.get(11)?;
        let sessions_json: String = row.get(12)?;
        Ok(ProjectRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            agents: serde_json::from_str(&agents_json).unwrap_or_default(),
            status: row.get(4)?,
            git: row.get(5)?,
            risk: row.get(6)?,
            confidence: row.get(7)?,
            activity: row.get(8)?,
            next_task: row.get(9)?,
            notes: row.get(10)?,
            recent_files: serde_json::from_str(&recent_files_json).unwrap_or_default(),
            sessions: serde_json::from_str(&sessions_json).unwrap_or_default(),
            last_scanned_ms: row.get(13)?,
            last_modified_ms: row.get(14)?,
        })
    })?;
    rows.collect()
}

pub fn project_path(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT path FROM projects WHERE id = ?1", [id], |row| {
        row.get(0)
    })
    .optional()
}

pub fn project_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<ProjectRecord>> {
    conn.query_row(
        "SELECT id, name, path, agents_json, status, git, risk, confidence, activity,
                next_task, notes, recent_files_json, sessions_json, last_scanned_ms,
                last_modified_ms
         FROM projects WHERE id = ?1",
        [id],
        |row| {
            let agents_json: String = row.get(3)?;
            let recent_files_json: String = row.get(11)?;
            let sessions_json: String = row.get(12)?;
            Ok(ProjectRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                agents: serde_json::from_str(&agents_json).unwrap_or_default(),
                status: row.get(4)?,
                git: row.get(5)?,
                risk: row.get(6)?,
                confidence: row.get(7)?,
                activity: row.get(8)?,
                next_task: row.get(9)?,
                notes: row.get(10)?,
                recent_files: serde_json::from_str(&recent_files_json).unwrap_or_default(),
                sessions: serde_json::from_str(&sessions_json).unwrap_or_default(),
                last_scanned_ms: row.get(13)?,
                last_modified_ms: row.get(14)?,
            })
        },
    )
    .optional()
}

pub fn project_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT count(*) FROM projects", [], |row| row.get(0))
}

pub fn scan_path_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT count(*) FROM scan_paths", [], |row| row.get(0))
}

pub fn provider_config(conn: &Connection) -> rusqlite::Result<ProviderConfig> {
    let config = conn
        .query_row(
            "SELECT mode, local_base_url, local_model, external_provider, external_model, api_key_stored
             FROM provider_config WHERE id = 1",
            [],
            |row| {
                Ok(ProviderConfig {
                    mode: row.get(0)?,
                    local_base_url: row.get(1)?,
                    local_model: row.get(2)?,
                    external_provider: row.get(3)?,
                    external_model: row.get(4)?,
                    api_key_stored: row.get::<_, i64>(5)? != 0,
                })
            },
        )
        .optional()?;

    Ok(config.map(provider::normalize_config).unwrap_or_default())
}

pub fn save_provider_config(
    conn: &Connection,
    config: ProviderConfig,
    updated_ms: i64,
) -> rusqlite::Result<ProviderConfig> {
    let config = provider::normalize_config(config);
    conn.execute(
        "INSERT INTO provider_config
          (id, mode, local_base_url, local_model, external_provider, external_model, api_key_stored, updated_ms)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           mode = excluded.mode,
           local_base_url = excluded.local_base_url,
           local_model = excluded.local_model,
           external_provider = excluded.external_provider,
           external_model = excluded.external_model,
           api_key_stored = excluded.api_key_stored,
           updated_ms = excluded.updated_ms",
        rusqlite::params![
            &config.mode,
            &config.local_base_url,
            &config.local_model,
            &config.external_provider,
            &config.external_model,
            if config.api_key_stored { 1 } else { 0 },
            updated_ms,
        ],
    )?;
    Ok(config)
}

pub fn list_custom_workflows(conn: &Connection) -> rusqlite::Result<Vec<CustomWorkflowRecord>> {
    let mut stmt = conn
        .prepare("SELECT workflow_json FROM custom_workflows ORDER BY updated_ms DESC, name ASC")?;
    let rows = stmt.query_map([], |row| {
        let workflow_json: String = row.get(0)?;
        serde_json::from_str::<CustomWorkflowRecord>(&workflow_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
    })?;
    rows.collect()
}

pub fn save_custom_workflow(
    conn: &Connection,
    workflow: &CustomWorkflowRecord,
    updated_ms: i64,
) -> rusqlite::Result<()> {
    let workflow_json = serde_json::to_string(workflow).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO custom_workflows (id, name, description, workflow_json, updated_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           workflow_json = excluded.workflow_json,
           updated_ms = excluded.updated_ms",
        rusqlite::params![
            workflow.id,
            workflow.name,
            workflow.description,
            workflow_json,
            updated_ms
        ],
    )?;
    Ok(())
}

pub fn delete_custom_workflow(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM custom_workflows WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_custom_agents(conn: &Connection) -> rusqlite::Result<Vec<CustomAgentRecord>> {
    let mut stmt =
        conn.prepare("SELECT agent_json FROM custom_agents ORDER BY updated_ms DESC, name ASC")?;
    let rows = stmt.query_map([], |row| {
        let agent_json: String = row.get(0)?;
        serde_json::from_str::<CustomAgentRecord>(&agent_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
    })?;
    rows.collect()
}

pub fn save_custom_agent(
    conn: &Connection,
    agent: &CustomAgentRecord,
    updated_ms: i64,
) -> rusqlite::Result<()> {
    let agent_json = serde_json::to_string(agent).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO custom_agents (id, name, role, model, authority, agent_json, updated_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           role = excluded.role,
           model = excluded.model,
           authority = excluded.authority,
           agent_json = excluded.agent_json,
           updated_ms = excluded.updated_ms",
        rusqlite::params![
            agent.id,
            agent.name,
            agent.role,
            agent.model,
            agent.authority,
            agent_json,
            updated_ms
        ],
    )?;
    Ok(())
}

pub fn delete_custom_agent(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM custom_agents WHERE id = ?1", [id])?;
    Ok(())
}

pub fn save_scan_run(
    conn: &Connection,
    started_ms: i64,
    finished_ms: i64,
    roots_scanned: usize,
    projects_found: usize,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO scan_runs (started_ms, finished_ms, roots_scanned, projects_found, status)
         VALUES (?1, ?2, ?3, ?4, 'ok')",
        rusqlite::params![
            started_ms,
            finished_ms,
            roots_scanned as i64,
            projects_found as i64
        ],
    )?;
    Ok(())
}

pub fn upsert_projects(
    conn: &mut Connection,
    projects: &[DetectedProject],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for project in projects {
        let agents_json = serde_json::to_string(&project.agents).unwrap_or_else(|_| "[]".into());
        let recent_files_json =
            serde_json::to_string(&project.recent_files).unwrap_or_else(|_| "[]".into());
        let sessions_json =
            serde_json::to_string(&project.sessions).unwrap_or_else(|_| "[]".into());

        tx.execute(
            "INSERT INTO projects
              (id, name, path, agents_json, status, git, risk, confidence, activity,
               next_task, notes, recent_files_json, sessions_json, last_scanned_ms,
               last_modified_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               path = excluded.path,
               agents_json = excluded.agents_json,
               status = excluded.status,
               git = excluded.git,
               risk = excluded.risk,
               confidence = excluded.confidence,
               activity = excluded.activity,
               next_task = excluded.next_task,
               notes = excluded.notes,
               recent_files_json = excluded.recent_files_json,
               sessions_json = excluded.sessions_json,
               last_scanned_ms = excluded.last_scanned_ms,
               last_modified_ms = excluded.last_modified_ms",
            rusqlite::params![
                project.id,
                project.name,
                project.path,
                agents_json,
                project.status,
                project.git,
                project.risk,
                project.confidence,
                project.activity,
                project.next_task,
                project.notes,
                recent_files_json,
                sessions_json,
                project.last_scanned_ms,
                project.last_modified_ms,
            ],
        )?;
    }
    tx.commit()
}

pub fn save_flow_run(conn: &Connection, run: &FlowRun) -> rusqlite::Result<()> {
    let seats_json = serde_json::to_string(&run.seats).unwrap_or_else(|_| "[]".into());
    let assumptions_json = serde_json::to_string(&run.assumptions).unwrap_or_else(|_| "[]".into());
    let sources_json = serde_json::to_string(&run.sources).unwrap_or_else(|_| "[]".into());
    let caveats_json = serde_json::to_string(&run.caveats).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO flow_runs
          (id, project_id, project_name, workflow_id, workflow_name, prompt, answer, guardrail,
           assumptions_json, sources_json, caveats_json, confidence,
           mode, status, started_ms, finished_ms, summary, verdict, seats_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           project_name = excluded.project_name,
           workflow_id = excluded.workflow_id,
           workflow_name = excluded.workflow_name,
           prompt = excluded.prompt,
           answer = excluded.answer,
           guardrail = excluded.guardrail,
           assumptions_json = excluded.assumptions_json,
           sources_json = excluded.sources_json,
           caveats_json = excluded.caveats_json,
           confidence = excluded.confidence,
           mode = excluded.mode,
           status = excluded.status,
           started_ms = excluded.started_ms,
           finished_ms = excluded.finished_ms,
           summary = excluded.summary,
           verdict = excluded.verdict,
           seats_json = excluded.seats_json",
        rusqlite::params![
            run.id,
            run.project_id,
            run.project_name,
            run.workflow_id,
            run.workflow_name,
            run.prompt,
            run.answer,
            run.guardrail,
            assumptions_json,
            sources_json,
            caveats_json,
            run.confidence,
            run.mode,
            run.status,
            run.started_ms,
            run.finished_ms,
            run.summary,
            run.verdict,
            seats_json,
        ],
    )?;
    Ok(())
}

pub fn list_flow_runs(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<FlowRun>> {
    let mut stmt = conn.prepare(
        "SELECT id, workflow_id, workflow_name, project_id, project_name, prompt, answer, guardrail,
                assumptions_json, sources_json, caveats_json, confidence,
                mode, status, started_ms, finished_ms, summary, verdict, seats_json
         FROM flow_runs ORDER BY started_ms DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        let assumptions_json: String = row.get(8)?;
        let sources_json: String = row.get(9)?;
        let caveats_json: String = row.get(10)?;
        let seats_json: String = row.get(18)?;
        Ok(FlowRun {
            id: row.get(0)?,
            workflow_id: row.get(1)?,
            workflow_name: row.get(2)?,
            project_id: row.get(3)?,
            project_name: row.get(4)?,
            prompt: row.get(5)?,
            answer: row.get(6)?,
            guardrail: row.get(7)?,
            assumptions: serde_json::from_str(&assumptions_json).unwrap_or_default(),
            sources: serde_json::from_str(&sources_json).unwrap_or_default(),
            caveats: serde_json::from_str(&caveats_json).unwrap_or_default(),
            confidence: row.get(11)?,
            mode: row.get(12)?,
            status: row.get(13)?,
            started_ms: row.get(14)?,
            finished_ms: row.get(15)?,
            summary: row.get(16)?,
            verdict: row.get(17)?,
            seats: serde_json::from_str(&seats_json).unwrap_or_default(),
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_project() -> DetectedProject {
        DetectedProject {
            id: project_id("/tmp/command-test"),
            name: "command-test".to_string(),
            path: "/tmp/command-test".to_string(),
            agents: vec!["Codex".to_string()],
            status: "Active".to_string(),
            git: "Clean".to_string(),
            risk: "Clear".to_string(),
            confidence: 92,
            activity: "just now".to_string(),
            next_task: "Ready for focused agent work".to_string(),
            notes: "Detected local project with 1 configured agent signal(s).".to_string(),
            recent_files: vec!["AGENTS.md".to_string(), "package.json".to_string()],
            sessions: vec![SessionSummary {
                agent: "Codex".to_string(),
                label: "Local project signal".to_string(),
                age: "just now".to_string(),
            }],
            last_scanned_ms: 100,
            last_modified_ms: Some(90),
        }
    }

    #[test]
    fn project_round_trips_through_sqlite() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        seed_defaults(&conn).unwrap();

        let project = sample_project();
        upsert_projects(&mut conn, &[project.clone()]).unwrap();

        let rows = list_projects(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, project.id);
        assert_eq!(rows[0].agents, vec!["Codex"]);
        assert_eq!(rows[0].recent_files, vec!["AGENTS.md", "package.json"]);
        assert_eq!(rows[0].sessions[0].label, "Local project signal");
        assert_eq!(
            project_path(&conn, &project.id).unwrap(),
            Some(project.path)
        );
    }

    #[test]
    fn flow_run_round_trips_through_sqlite() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        seed_defaults(&conn).unwrap();

        let project = sample_project();
        upsert_projects(&mut conn, &[project.clone()]).unwrap();
        let stored_project = project_by_id(&conn, &project.id).unwrap().unwrap();
        let run = crate::flow::build_example_flow(
            &stored_project,
            "project-review",
            false,
            900,
            "What should happen next?",
        );

        save_flow_run(&conn, &run).unwrap();
        let runs = list_flow_runs(&conn, 10).unwrap();

        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, "flow-900");
        assert_eq!(runs[0].prompt, "What should happen next?");
        assert!(!runs[0].answer.is_empty());
        assert!(!runs[0].guardrail.is_empty());
        assert!(!runs[0].assumptions.is_empty());
        assert!(!runs[0].sources.is_empty());
        assert!(!runs[0].caveats.is_empty());
        assert!(runs[0].confidence > 0);
        assert_eq!(runs[0].project_id, project.id);
        assert_eq!(runs[0].seats.len(), 5);
        assert_eq!(runs[0].seats[4].agent, "Judge");
    }

    #[test]
    fn provider_config_defaults_and_round_trips() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        seed_defaults(&conn).unwrap();

        let defaults = provider_config(&conn).unwrap();
        assert_eq!(defaults.mode, "demo");
        assert_eq!(defaults.local_base_url, "http://127.0.0.1:11434/v1");

        let saved = save_provider_config(
            &conn,
            ProviderConfig {
                mode: "local".to_string(),
                local_base_url: " http://localhost:1234 ".to_string(),
                local_model: " qwen2.5-coder:14b ".to_string(),
                external_provider: "OpenAI".to_string(),
                external_model: "gpt-4.1-mini".to_string(),
                api_key_stored: false,
            },
            500,
        )
        .unwrap();

        assert_eq!(saved.mode, "local");
        assert_eq!(saved.local_base_url, "http://localhost:1234");
        assert_eq!(
            provider_config(&conn).unwrap().local_model,
            "qwen2.5-coder:14b"
        );
    }
}
