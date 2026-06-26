mod codex_bridge;
mod commands;
mod db;
mod flow;
mod git;
mod launch;
mod provider;
mod scan;
mod workflow_runner;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("ai-command-central.sqlite");
            let conn = db::open(&db_path)?;

            app.manage(db::Db(Mutex::new(conn)));
            app.manage(commands::ScanState::default());
            app.manage(commands::FlowRunState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::list_projects,
            commands::list_scan_paths,
            commands::scan_projects,
            commands::run_example_flow,
            commands::run_custom_workflow,
            commands::cancel_current_flow,
            commands::list_flow_runs,
            commands::list_custom_workflows,
            commands::save_custom_workflow,
            commands::delete_custom_workflow,
            commands::list_custom_agents,
            commands::save_custom_agent,
            commands::delete_custom_agent,
            commands::open_run_artifact_folder,
            commands::codex_bridge_status,
            commands::claude_bridge_status,
            commands::provider_config,
            commands::save_provider_config,
            commands::save_provider_api_key,
            commands::clear_provider_api_key,
            commands::provider_endpoint_status,
            commands::list_ollama_models,
            commands::preview_agent_file,
            commands::write_agent_file,
            commands::open_project,
            commands::open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Command Central");
}
