import type {
  Agent,
  AgentFilePreview,
  AgentFileWriteResult,
  AgentProfile,
  AppStatus,
  ClaudeBridgeStatus,
  CodexBridgeStatus,
  ExampleFlowRun,
  FlowProgressEvent,
  Project,
  ProviderConfig,
  ProviderEndpointStatus,
  SeatAssignmentMap,
  ScanResult,
  Workflow
} from "./types";

type BackendProject = Omit<Project, "agents"> & {
  agents: string[];
  lastScannedMs?: number;
  lastModifiedMs?: number | null;
};

type BackendAgentFileWriteResult = Omit<AgentFileWriteResult, "project"> & {
  project: BackendProject;
};

const agentNames: Agent[] = ["Claude", "Codex", "Gemini", "Grok"];

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function normalizeProject(project: BackendProject): Project {
  return {
    ...project,
    agents: project.agents.filter((agent): agent is Agent => agentNames.includes(agent as Agent))
  };
}

export async function getAppStatus(): Promise<AppStatus | null> {
  return invokeCommand<AppStatus>("app_status");
}

export async function listBackendProjects(): Promise<Project[] | null> {
  const projects = await invokeCommand<BackendProject[]>("list_projects");
  return projects?.map(normalizeProject) ?? null;
}

export async function scanBackendProjects(): Promise<ScanResult | null> {
  return invokeCommand<ScanResult>("scan_projects");
}

export async function runBackendExampleFlow(
  projectId: string,
  workflowId: string,
  live: boolean,
  prompt: string,
  seatAssignments: SeatAssignmentMap
): Promise<ExampleFlowRun | null> {
  return invokeCommand<ExampleFlowRun>("run_example_flow", { projectId, workflowId, live, prompt, seatAssignments });
}

export async function runBackendCustomWorkflow(
  projectId: string,
  workflow: Workflow,
  live: boolean,
  prompt: string,
  agents: AgentProfile[]
): Promise<ExampleFlowRun | null> {
  return invokeCommand<ExampleFlowRun>("run_custom_workflow", { projectId, workflow, live, prompt, agents });
}

export async function cancelBackendFlow(): Promise<boolean> {
  const result = await invokeCommand<void>("cancel_current_flow");
  return result !== null;
}

export async function listenBackendFlowProgress(
  onProgress: (event: FlowProgressEvent) => void
): Promise<(() => void) | null> {
  if (!isTauriRuntime()) return null;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<FlowProgressEvent>("flow-progress", (event) => onProgress(event.payload));
}

export async function listBackendFlowRuns(limit = 20): Promise<ExampleFlowRun[] | null> {
  return invokeCommand<ExampleFlowRun[]>("list_flow_runs", { limit });
}

export async function listBackendCustomWorkflows(): Promise<Workflow[] | null> {
  return invokeCommand<Workflow[]>("list_custom_workflows");
}

export async function saveBackendCustomWorkflow(workflow: Workflow): Promise<Workflow | null> {
  return invokeCommand<Workflow>("save_custom_workflow", { workflow });
}

export async function deleteBackendCustomWorkflow(id: string): Promise<boolean> {
  const result = await invokeCommand<void>("delete_custom_workflow", { id });
  return result !== null;
}

export async function listBackendCustomAgents(): Promise<AgentProfile[] | null> {
  return invokeCommand<AgentProfile[]>("list_custom_agents");
}

export async function saveBackendCustomAgent(agent: AgentProfile): Promise<AgentProfile | null> {
  return invokeCommand<AgentProfile>("save_custom_agent", { agent });
}

export async function deleteBackendCustomAgent(id: string): Promise<boolean> {
  const result = await invokeCommand<void>("delete_custom_agent", { id });
  return result !== null;
}

export async function openBackendRunArtifactFolder(runId: string): Promise<boolean> {
  const result = await invokeCommand<void>("open_run_artifact_folder", { runId });
  return result !== null;
}

export async function getBackendCodexBridgeStatus(): Promise<CodexBridgeStatus | null> {
  return invokeCommand<CodexBridgeStatus>("codex_bridge_status");
}

export async function getBackendClaudeBridgeStatus(): Promise<ClaudeBridgeStatus | null> {
  return invokeCommand<ClaudeBridgeStatus>("claude_bridge_status");
}

export async function getBackendProviderConfig(): Promise<ProviderConfig | null> {
  return invokeCommand<ProviderConfig>("provider_config");
}

export async function saveBackendProviderConfig(config: ProviderConfig): Promise<ProviderConfig | null> {
  return invokeCommand<ProviderConfig>("save_provider_config", { config });
}

export async function checkBackendProviderEndpoint(config: ProviderConfig): Promise<ProviderEndpointStatus | null> {
  return invokeCommand<ProviderEndpointStatus>("provider_endpoint_status", { config });
}

export async function listBackendOllamaModels(config: ProviderConfig): Promise<string[] | null> {
  return invokeCommand<string[]>("list_ollama_models", { config });
}

export async function previewBackendAgentFile(projectId: string): Promise<AgentFilePreview | null> {
  return invokeCommand<AgentFilePreview>("preview_agent_file", { projectId });
}

export async function writeBackendAgentFile(projectId: string, content: string): Promise<AgentFileWriteResult | null> {
  const result = await invokeCommand<BackendAgentFileWriteResult>("write_agent_file", { projectId, content });
  return result ? { ...result, project: normalizeProject(result.project) } : null;
}

export async function openBackendProject(id: string): Promise<boolean> {
  const result = await invokeCommand<void>("open_project", { id });
  return result !== null;
}

export async function openBackendTerminal(id: string): Promise<boolean> {
  const result = await invokeCommand<void>("open_terminal", { id });
  return result !== null;
}
