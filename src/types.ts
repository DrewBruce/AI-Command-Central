export type NavItem = "command" | "projects" | "workflows" | "runs" | "agents" | "settings";

export type Agent = "Claude" | "Codex" | "Gemini" | "Grok";

export type ProjectStatus = "Active" | "Recent" | "Dormant";
export type GitState = "Clean" | "Dirty" | "Ahead" | "Behind";
export type RiskState = "Clear" | "Needs agent file" | "Secret flagged" | "Review";

export type Project = {
  id: string;
  name: string;
  path: string;
  agents: Agent[];
  status: ProjectStatus;
  git: GitState;
  risk: RiskState;
  confidence: number;
  activity: string;
  nextTask: string;
  notes: string;
  recentFiles: string[];
  sessions: Array<{ agent: Agent; label: string; age: string }>;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  seats: number;
  runTime: string;
  recommendedFor: string;
  nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    kind: "input" | "research" | "review" | "decision" | "human";
    agentId?: string;
    role?: string;
    function?: string;
  }>;
  edges: Array<[string, string]>;
};

export type RunRecord = {
  id: string;
  workflow: string;
  project: string;
  mode: "Live" | "Mock";
  outcome: "Approved" | "Needs revision" | "Saved" | "Failed";
  cost: string;
  duration: string;
  time: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  role: string;
  model: string;
  authority: "Recommend" | "Decide" | "Approve" | "Act";
  defaultTools: string[];
  instructions?: string;
  skillRef?: string;
  promptRef?: string;
  webSearch?: boolean;
  outputFormat?: "summary" | "markdown" | "json" | "html";
  localFit?: "low" | "medium" | "high";
};

export type TimelineStep = {
  label: string;
  state: "done" | "active" | "waiting";
  detail: string;
};

export type BackendMode = "demo" | "empty" | "local";

export type ProviderMode = "demo" | "local" | "external";
export type ProviderTone = "ok" | "warn" | "review" | "danger";

export type ProviderConfig = {
  mode: ProviderMode;
  localBaseUrl: string;
  localModel: string;
  externalProvider: string;
  externalModel: string;
  apiKeyStored: boolean;
};

export type ProviderEndpointStatus = {
  available: boolean;
  modelInstalled: boolean;
  label: string;
  detail: string;
  checkedUrl: string;
  models: string[];
};

export type ProviderReadiness = {
  tone: ProviderTone;
  label: string;
  detail: string;
  runModeLabel: string;
  canRunLive: boolean;
  issues: string[];
};

export type CodexBridgeStatus = {
  available: boolean;
  path: string | null;
  detail: string;
};

export type ClaudeBridgeStatus = CodexBridgeStatus;

export type CouncilSeatId = "brief" | "scan" | "risk" | "chair" | "judge";
export type SeatRunner = "system" | "demo" | "codex" | "claude" | "local";
export type SeatAssignmentMap = Record<CouncilSeatId, SeatRunner>;

export type AppStatus = {
  backend: string;
  dbPath: string;
  projectCount: number;
  scanPathCount: number;
};

export type ScanResult = {
  projectsFound: number;
  rootsScanned: number;
  durationMs: number;
};

export type AgentFilePreview = {
  projectId: string;
  projectName: string;
  projectPath: string;
  filePath: string;
  exists: boolean;
  content: string;
  lineCount: number;
};

export type AgentFileWriteResult = {
  project: Project;
  filePath: string;
  bytesWritten: number;
};

export type FlowSeatResult = {
  seatId: string;
  label: string;
  agent: string;
  role: string;
  status: "done" | "active" | "waiting";
  summary: string;
  evidence: string[];
};

export type ExampleFlowRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  projectId: string;
  projectName: string;
  prompt: string;
  answer: string;
  guardrail: string;
  assumptions: string[];
  sources: string[];
  caveats: string[];
  confidence: number;
  mode: "Mock" | "Live";
  status: "Completed" | "Running" | "Failed";
  startedMs: number;
  finishedMs: number;
  summary: string;
  verdict: "APPROVE" | "REVISE" | "ESCALATE";
  seats: FlowSeatResult[];
};

export type FlowProgressEvent = {
  runId: string;
  nodeId: string;
  status: "started" | "completed";
  label: string;
  detail: string;
  completedNodeIds: string[];
  elapsedMs: number | null;
};
