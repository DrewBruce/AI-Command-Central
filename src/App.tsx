import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  Command,
  Copy,
  Database,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  History,
  KeyRound,
  LayoutDashboard,
  Library,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  X
} from "lucide-react";
import { agents, projects as seedProjects, runs, workflows } from "./data";
import {
  cancelBackendFlow,
  checkBackendProviderEndpoint,
  clearBackendProviderApiKey,
  getBackendClaudeBridgeStatus,
  getBackendCodexBridgeStatus,
  getBackendProviderConfig,
  getAppStatus,
  listenBackendFlowProgress,
  deleteBackendCustomAgent,
  deleteBackendCustomWorkflow,
  listBackendCustomAgents,
  listBackendCustomWorkflows,
  listBackendOllamaModels,
  listBackendProjects,
  listBackendFlowRuns,
  openBackendProject,
  openBackendRunArtifactFolder,
  openBackendTerminal,
  previewBackendAgentFile,
  runBackendCustomWorkflow,
  runBackendExampleFlow,
  saveBackendCustomAgent,
  saveBackendCustomWorkflow,
  saveBackendProviderApiKey,
  saveBackendProviderConfig,
  scanBackendProjects,
  writeBackendAgentFile
} from "./backend";
import { createDemoFlowRun } from "./flow";
import {
  appleFoundationModelsAgentModel,
  appleFoundationModelsGuidance,
  appleFoundationModelsModel,
  appleFoundationModelsProviderPreset,
  defaultProviderConfig,
  getProviderReadiness,
  isAppleFoundationModelsConfig,
  isSupportedExternalProvider,
  loadStoredProviderConfig,
  normalizeProviderConfig,
  ollamaGemmaProviderPreset,
  storeProviderConfig
} from "./provider";
import { createDemoAgentFilePreview } from "./readiness";
import {
  councilSeatLabels,
  defaultSeatAssignments,
  getCouncilRunReadiness,
  loadStoredSeatAssignments,
  normalizeSeatAssignments,
  seatRunnerOptions,
  seatRunnerStatus,
  storeSeatAssignments
} from "./seatAssignments";
import type {
  Agent,
  AgentFilePreview,
  AgentProfile,
  AppStatus,
  BackendMode,
  ClaudeBridgeStatus,
  CodexBridgeStatus,
  CouncilSeatId,
  ExampleFlowRun,
  GitState,
  NavItem,
  Project,
  ProviderConfig,
  ProviderEndpointStatus,
  ProviderReadiness,
  RiskState,
  SeatAssignmentMap,
  SeatRunner,
  TimelineStep,
  Workflow as WorkflowType
} from "./types";

const navItems: Array<{ id: NavItem; label: string; icon: typeof LayoutDashboard }> = [
  { id: "command", label: "Command Center", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "runs", label: "Runs", icon: History },
  { id: "agents", label: "Agent Library", icon: Library },
  { id: "settings", label: "Settings", icon: Settings }
];

const filterOptions = ["All", "Needs attention", "Active", "Dirty git", "Security", "No agent file"] as const;
type ProjectFilter = (typeof filterOptions)[number];

type RunProgress = {
  activeNodeId: string | null;
  completedNodeIds: string[];
  label: string;
  detail: string;
};

type RunLogEntry = {
  id: string;
  nodeId: string;
  label: string;
  detail: string;
  status: "started" | "completed" | "failed";
  elapsedMs: number | null;
  timestampMs: number;
};

type WorkflowRuntimeState = "runnable" | "needs-setup" | "demo-only";

type WorkflowRuntimeSummary = {
  state: WorkflowRuntimeState;
  label: string;
  detail: string;
  tone: ProviderReadiness["tone"];
  liveSeatCount: number;
  demoSeatCount: number;
  systemSeatCount: number;
  runners: string[];
  blockedSeats: string[];
};

type ValidationState = "pass" | "warn" | "blocked";

type RunValidationCheck = {
  id: string;
  label: string;
  detail: string;
  state: ValidationState;
};

type WorkflowPattern = "blank" | "council" | "parallel" | "gate" | "handoff" | "revise" | "planner";

type WorkflowDraft = {
  name: string;
  purpose: string;
  pattern: WorkflowPattern;
};

type AgentDraft = {
  name: string;
  role: string;
  model: string;
  authority: AgentProfile["authority"];
  tools: string;
  instructions: string;
  skillRef: string;
  promptRef: string;
  webSearch: boolean;
  outputFormat: NonNullable<AgentProfile["outputFormat"]>;
  localFit: NonNullable<AgentProfile["localFit"]>;
};

const defaultCouncilPrompt = "Should I let agents work on this project yet, and what should happen first?";
const customWorkflowStorageKey = "ai-command-central.custom-workflows.v1";
const customAgentStorageKey = "ai-command-central.custom-agents.v1";
const defaultCodexBridgeStatus: CodexBridgeStatus = {
  available: false,
  path: null,
  detail: "Codex bridge has not been checked yet."
};
const defaultClaudeBridgeStatus: ClaudeBridgeStatus = {
  available: false,
  path: null,
  detail: "Claude bridge has not been checked yet."
};

const councilRunSteps = [
  { nodeId: "brief", timelineLabel: "Context", label: "Preparing context packet", activeDetail: "Combining your question with project context", doneDetail: "Question and project context prepared" },
  { nodeId: "scan", timelineLabel: "Scan", label: "Researcher scanning", activeDetail: "Reading agent signals, recent files, and git state", doneDetail: "Recent files and git read" },
  { nodeId: "risk", timelineLabel: "Risk", label: "Critic stress-testing", activeDetail: "Checking missing context, dirty git, and safety risks", doneDetail: "Risks challenged" },
  { nodeId: "chair", timelineLabel: "Chair", label: "Chair synthesizing", activeDetail: "Turning competing signals into a next move", doneDetail: "Recommendation shaped" },
  { nodeId: "judge", timelineLabel: "Judge", label: "Judge deciding", activeDetail: "Returning the final verdict", doneDetail: "Verdict returned" },
  { nodeId: "save", timelineLabel: "Save", label: "Saving report", activeDetail: "Saving the report to history", doneDetail: "Run saved" }
] as const;

const workflowPatternOptions: Array<{ id: WorkflowPattern; label: string; detail: string }> = [
  { id: "blank", label: "Blank canvas", detail: "Start with no seats and drop agents onto the canvas" },
  { id: "council", label: "Council review", detail: "Context, scanner, critic, chair, judge" },
  { id: "parallel", label: "Parallel research", detail: "One context seat fans out to two researchers" },
  { id: "gate", label: "Ship gate", detail: "Code health and release checks meet a decision gate" },
  { id: "handoff", label: "Specialist handoff", detail: "Requester, specialist, reviewer, final owner" },
  { id: "revise", label: "Review and revision", detail: "Draft, critique, revise, approve" },
  { id: "planner", label: "Planner and executors", detail: "Plan once, fan out to executors, synthesize" }
];

function workflowSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
}

function createCustomAgentFromDraft(draft: AgentDraft): AgentProfile {
  const name = draft.name.trim() || "Untitled Agent";
  const base = workflowSlug(name) || "agent";
  const tools = draft.tools
    .split(/[,;\n]/)
    .map((tool) => tool.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    id: `custom-agent-${base}-${Date.now().toString(36)}`,
    name,
    role: draft.role.trim() || "Handles a custom workflow role",
    model: draft.model.trim() || "Codex/Claude",
    authority: draft.authority,
    defaultTools: tools.length > 0 ? tools : ["Files"],
    instructions: draft.instructions.trim() || undefined,
    skillRef: draft.skillRef.trim() || undefined,
    promptRef: draft.promptRef.trim() || undefined,
    webSearch: draft.webSearch,
    outputFormat: draft.outputFormat,
    localFit: draft.localFit
  };
}

function createAgentDraftFromProfile(agent: AgentProfile): AgentDraft {
  return {
    name: agent.name,
    role: agent.role,
    model: agent.model,
    authority: agent.authority,
    tools: agent.defaultTools.join(", "),
    instructions: agent.instructions ?? "",
    skillRef: agent.skillRef ?? "",
    promptRef: agent.promptRef ?? "",
    webSearch: Boolean(agent.webSearch),
    outputFormat: agent.outputFormat ?? "summary",
    localFit: agent.localFit ?? "medium"
  };
}

function updateAgentFromDraft(agent: AgentProfile, draft: AgentDraft): AgentProfile {
  const next = createCustomAgentFromDraft(draft);
  return {
    ...next,
    id: agent.id
  };
}

function defaultAgentDraft(): AgentDraft {
  return {
    name: "Evidence Analyst",
    role: "Finds relevant evidence, checks assumptions, and reports concise findings",
    model: "Codex or Claude",
    authority: "Recommend",
    tools: "Files, Web Search, Terminal read-only",
    instructions: "Return concise findings with evidence and a practical recommendation.",
    skillRef: "",
    promptRef: "",
    webSearch: false,
    outputFormat: "summary",
    localFit: "medium"
  };
}

function isCustomWorkflow(workflow: WorkflowType) {
  return workflow.id.startsWith("custom-");
}

function isDynamicWorkflow(workflow: WorkflowType) {
  return isCustomWorkflow(workflow) || workflow.nodes.some((node) => Boolean(node.agentId || node.function));
}

function workflowNodeKindForAgent(agent: AgentProfile): WorkflowType["nodes"][number]["kind"] {
  if (agent.authority === "Decide") return "decision";
  if (agent.authority === "Approve") return "human";
  if (/research|evidence|source|scan|find/i.test(agent.role)) return "research";
  if (/critic|risk|review|test|qa/i.test(agent.role)) return "review";
  return "review";
}

function workflowWithSeatCount(workflow: WorkflowType): WorkflowType {
  return {
    ...workflow,
    seats: workflow.nodes.length
  };
}

function createWorkflowFromDraft(draft: WorkflowDraft): WorkflowType {
  const name = draft.name.trim() || "Untitled Workflow";
  const purpose = draft.purpose.trim() || "Custom local workflow for the selected project.";
  const base = workflowSlug(name) || "workflow";
  const id = `custom-${base}-${Date.now().toString(36)}`;

  const patterns: Record<WorkflowPattern, Pick<WorkflowType, "nodes" | "edges" | "seats" | "runTime" | "recommendedFor">> = {
    blank: {
      seats: 0,
      runTime: "Custom",
      recommendedFor: "Custom workflow",
      nodes: [],
      edges: []
    },
    council: {
      seats: 5,
      runTime: "3-7 min",
      recommendedFor: "Ambiguous decisions",
      nodes: [
        { id: "brief", label: "Context", x: 36, y: 98, kind: "input" },
        { id: "scan", label: "Scanner", x: 190, y: 38, kind: "research" },
        { id: "risk", label: "Risk", x: 190, y: 154, kind: "review" },
        { id: "chair", label: "Chair", x: 356, y: 98, kind: "review" },
        { id: "judge", label: "Judge", x: 524, y: 98, kind: "decision" }
      ],
      edges: [["brief", "scan"], ["brief", "risk"], ["scan", "chair"], ["risk", "chair"], ["chair", "judge"]]
    },
    parallel: {
      seats: 5,
      runTime: "2-5 min",
      recommendedFor: "Evidence gathering",
      nodes: [
        { id: "brief", label: "Question", x: 42, y: 98, kind: "input" },
        { id: "scan", label: "Source A", x: 214, y: 42, kind: "research" },
        { id: "risk", label: "Source B", x: 214, y: 154, kind: "research" },
        { id: "chair", label: "Synthesis", x: 410, y: 98, kind: "review" },
        { id: "judge", label: "Decision", x: 584, y: 98, kind: "decision" }
      ],
      edges: [["brief", "scan"], ["brief", "risk"], ["scan", "chair"], ["risk", "chair"], ["chair", "judge"]]
    },
    gate: {
      seats: 5,
      runTime: "4-8 min",
      recommendedFor: "Release decisions",
      nodes: [
        { id: "brief", label: "Scope", x: 44, y: 96, kind: "input" },
        { id: "scan", label: "Code", x: 212, y: 42, kind: "research" },
        { id: "risk", label: "Risks", x: 212, y: 152, kind: "review" },
        { id: "chair", label: "Gate", x: 404, y: 96, kind: "human" },
        { id: "judge", label: "Decision", x: 572, y: 96, kind: "decision" }
      ],
      edges: [["brief", "scan"], ["brief", "risk"], ["scan", "chair"], ["risk", "chair"], ["chair", "judge"]]
    },
    handoff: {
      seats: 4,
      runTime: "3-6 min",
      recommendedFor: "Specialist routing",
      nodes: [
        { id: "request", label: "Request", x: 44, y: 98, kind: "input", role: "Requester", function: "Define the exact outcome and constraints." },
        { id: "specialist", label: "Specialist", x: 226, y: 98, kind: "research", role: "Specialist", function: "Do the specialist analysis or task-specific investigation." },
        { id: "reviewer", label: "Reviewer", x: 410, y: 98, kind: "review", role: "Reviewer", function: "Check the specialist output for gaps, risks, and practical usability." },
        { id: "owner", label: "Owner", x: 590, y: 98, kind: "decision", role: "Owner", function: "Return the final handoff decision and next action." }
      ],
      edges: [["request", "specialist"], ["specialist", "reviewer"], ["reviewer", "owner"]]
    },
    revise: {
      seats: 5,
      runTime: "4-9 min",
      recommendedFor: "Draft quality",
      nodes: [
        { id: "brief", label: "Brief", x: 36, y: 98, kind: "input", role: "Brief", function: "Prepare the desired output, audience, constraints, and acceptance bar." },
        { id: "draft", label: "Draft", x: 196, y: 42, kind: "research", role: "Producer", function: "Produce the first useful answer or artefact." },
        { id: "critique", label: "Critique", x: 196, y: 154, kind: "review", role: "Critic", function: "Identify gaps, weak reasoning, omissions, and quality issues." },
        { id: "revise", label: "Revise", x: 396, y: 98, kind: "review", role: "Reviser", function: "Revise the draft using critique and preserve what already works." },
        { id: "approve", label: "Approve", x: 590, y: 98, kind: "decision", role: "Approver", function: "Approve, revise again, or escalate with a concrete reason." }
      ],
      edges: [["brief", "draft"], ["brief", "critique"], ["draft", "revise"], ["critique", "revise"], ["revise", "approve"]]
    },
    planner: {
      seats: 5,
      runTime: "5-10 min",
      recommendedFor: "Multi-step work",
      nodes: [
        { id: "brief", label: "Brief", x: 36, y: 98, kind: "input", role: "Brief", function: "Clarify the target outcome and constraints." },
        { id: "planner", label: "Planner", x: 190, y: 98, kind: "review", role: "Planner", function: "Break the work into safe, ordered tasks and assign execution roles." },
        { id: "exec-a", label: "Executor A", x: 370, y: 42, kind: "research", role: "Executor", function: "Execute or analyse the first branch of the plan." },
        { id: "exec-b", label: "Executor B", x: 370, y: 154, kind: "research", role: "Executor", function: "Execute or analyse the second branch of the plan." },
        { id: "synthesis", label: "Synthesis", x: 590, y: 98, kind: "decision", role: "Synthesis", function: "Combine executor outputs into a final recommendation and next action." }
      ],
      edges: [["brief", "planner"], ["planner", "exec-a"], ["planner", "exec-b"], ["exec-a", "synthesis"], ["exec-b", "synthesis"]]
    }
  };

  return {
    id,
    name,
    description: purpose,
    ...patterns[draft.pattern]
  };
}

function loadStoredCustomWorkflows(): WorkflowType[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(customWorkflowStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((workflow): workflow is WorkflowType => {
      return Boolean(
        workflow &&
        typeof workflow.id === "string" &&
        typeof workflow.name === "string" &&
        Array.isArray(workflow.nodes) &&
        Array.isArray(workflow.edges)
      );
    });
  } catch {
    return [];
  }
}

function storeCustomWorkflows(customWorkflows: WorkflowType[]) {
  window.localStorage.setItem(customWorkflowStorageKey, JSON.stringify(customWorkflows));
}

function loadStoredCustomAgents(): AgentProfile[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(customAgentStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((agent): agent is AgentProfile => {
      return Boolean(
        agent &&
        typeof agent.id === "string" &&
        typeof agent.name === "string" &&
        typeof agent.role === "string" &&
        typeof agent.model === "string" &&
        Array.isArray(agent.defaultTools)
      );
    });
  } catch {
    return [];
  }
}

function storeCustomAgents(customAgents: AgentProfile[]) {
  window.localStorage.setItem(customAgentStorageKey, JSON.stringify(customAgents));
}

function normalizeAgentProfile(agent: AgentProfile): AgentProfile {
  return {
    ...agent,
    defaultTools: Array.isArray(agent.defaultTools) ? agent.defaultTools : ["Files"],
    outputFormat: agent.outputFormat ?? "summary",
    localFit: agent.localFit ?? (/local|ollama|gemma|apple foundation|foundation models/i.test(agent.model) ? "high" : "medium"),
    webSearch: Boolean(agent.webSearch)
  };
}

function mergeCustomItems<T extends { id: string }>(localItems: T[], backendItems: T[]) {
  const seen = new Set<string>();
  return [...localItems, ...backendItems].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function mergeAgentLibrary(baseAgents: AgentProfile[], customAgentOverrides: AgentProfile[]) {
  const byId = new Map<string, AgentProfile>();
  baseAgents.forEach((agent) => byId.set(agent.id, normalizeAgentProfile(agent)));
  customAgentOverrides.forEach((agent) => byId.set(agent.id, normalizeAgentProfile(agent)));
  return [...byId.values()];
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function timelineFromProgress(progress: RunProgress | null, hasCompletedRun: boolean): TimelineStep[] {
  const completed = new Set(
    progress?.completedNodeIds ?? (hasCompletedRun ? councilRunSteps.map((step) => step.nodeId) : [])
  );
  return councilRunSteps.map((step) => {
    const isActive = progress?.activeNodeId === step.nodeId;
    return {
      label: step.timelineLabel,
      state: isActive ? "active" : completed.has(step.nodeId) ? "done" : "waiting",
      detail: isActive ? step.activeDetail : completed.has(step.nodeId) ? step.doneDetail : "Queued"
    };
  });
}

function timelineFromWorkflowProgress(
  progress: RunProgress | null,
  workflow: WorkflowType,
  hasCompletedRun: boolean
): TimelineStep[] {
  const nodeIds = workflow.nodes.map((node) => node.id);
  const completed = new Set(progress?.completedNodeIds ?? (hasCompletedRun ? [...nodeIds, "save"] : []));
  const steps = [
    ...workflow.nodes.map((node) => ({
      nodeId: node.id,
      label: node.label,
      activeDetail: isLocalReportWriterNode(node) ? "Generating local report artifacts" : `Running ${node.role || node.kind}`,
      doneDetail: isLocalReportWriterNode(node) ? "Report artifacts generated" : "Seat complete"
    })),
    { nodeId: "save", label: "Save", activeDetail: "Saving report", doneDetail: "Run saved" }
  ];

  return steps.map((step) => {
    const isActive = progress?.activeNodeId === step.nodeId;
    return {
      label: step.label,
      state: isActive ? "active" : completed.has(step.nodeId) ? "done" : "waiting",
      detail: isActive ? progress?.detail ?? step.activeDetail : completed.has(step.nodeId) ? step.doneDetail : "Queued"
    };
  });
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function providerToneDot(tone: ProviderReadiness["tone"]) {
  if (tone === "ok") return "ok";
  if (tone === "warn") return "warn";
  if (tone === "danger") return "danger";
  return "review";
}

function runnerLabel(runner: SeatRunner) {
  return seatRunnerOptions.find((option) => option.id === runner)?.label ?? "Demo model";
}

function runnerForStep(nodeId: string, assignments: SeatAssignmentMap) {
  if (nodeId === "brief") return runnerLabel(assignments.brief);
  if (nodeId === "scan") return runnerLabel(assignments.scan);
  if (nodeId === "risk") return runnerLabel(assignments.risk);
  if (nodeId === "chair") return runnerLabel(assignments.chair);
  if (nodeId === "judge") return runnerLabel(assignments.judge);
  return "System";
}

function isLocalReportWriterNode(node: WorkflowType["nodes"][number]) {
  return (
    node.id === "local-report" ||
    node.agentId === "local-report-writer" ||
    node.label.toLowerCase().includes("local report writer") ||
    (node.role ?? "").toLowerCase().includes("local report writer")
  );
}

function inferredRunnerForWorkflowNode(
  node: WorkflowType["nodes"][number],
  workflowAgents: AgentProfile[],
  providerConfig: ProviderConfig
): SeatRunner {
  if (node.kind === "input" || node.kind === "human") return "system";
  if (isLocalReportWriterNode(node)) return "system";
  const agent = node.agentId ? workflowAgents.find((candidate) => candidate.id === node.agentId) : null;
  const signal = `${agent?.name ?? ""} ${agent?.model ?? ""} ${agent?.role ?? ""} ${node.label} ${node.role ?? ""} ${node.function ?? ""}`.toLowerCase();
  const localModel = providerConfig.localModel.toLowerCase();
  const localModelIsGenericSystem = localModel === "system" || localModel === "pcc";
  if (signal.includes("codex")) return "codex";
  if (signal.includes("claude") || signal.includes("sonnet") || signal.includes("haiku") || signal.includes("opus")) return "claude";
  if (
    signal.includes("ollama") ||
    signal.includes("apple foundation") ||
    signal.includes("foundation models") ||
    signal.includes("fm serve") ||
    signal.includes("local") ||
    signal.includes("gemma") ||
    (localModel && !localModelIsGenericSystem && signal.includes(localModel))
  ) {
    return "local";
  }
  return "demo";
}

function runnerDisplayName(runner: SeatRunner, providerConfig: ProviderConfig) {
  if (runner === "local") return `Local model · ${providerConfig.localModel}`;
  return runnerLabel(runner);
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stateFromReadiness(readiness: ProviderReadiness): WorkflowRuntimeState {
  if (readiness.canRunLive) return "runnable";
  return readiness.runModeLabel.toLowerCase().includes("demo only") ? "demo-only" : "needs-setup";
}

function runtimeSummaryFromCouncilReadiness(
  readiness: ProviderReadiness,
  assignments: SeatAssignmentMap,
  providerConfig: ProviderConfig
): WorkflowRuntimeSummary {
  const state = stateFromReadiness(readiness);
  const runners = Object.values(assignments);
  return {
    state,
    label: state === "runnable" ? "Runnable" : state === "demo-only" ? "Demo only" : "Needs setup",
    detail: readiness.detail,
    tone: readiness.tone,
    liveSeatCount: runners.filter((runner) => runner === "codex" || runner === "claude" || runner === "local").length,
    demoSeatCount: runners.filter((runner) => runner === "demo").length,
    systemSeatCount: runners.filter((runner) => runner === "system").length,
    runners: uniqueValues(runners.map((runner) => runnerDisplayName(runner, providerConfig))),
    blockedSeats: readiness.issues
  };
}

function getWorkflowRuntimeSummary(
  workflow: WorkflowType,
  workflowAgents: AgentProfile[],
  providerConfig: ProviderConfig,
  providerReadiness: ProviderReadiness,
  codexStatus: CodexBridgeStatus,
  claudeStatus: ClaudeBridgeStatus,
  backendMode: BackendMode
): WorkflowRuntimeSummary {
  const seatRunners = workflow.nodes.map((node) => ({
    node,
    runner: inferredRunnerForWorkflowNode(node, workflowAgents, providerConfig)
  }));
  const systemSeatCount = seatRunners.filter(({ runner }) => runner === "system").length;
  const demoSeats = seatRunners.filter(({ runner }) => runner === "demo");
  const liveSeatCount = seatRunners.filter(({ runner }) => runner === "codex" || runner === "claude" || runner === "local").length;
  const runners = uniqueValues(seatRunners.map(({ runner }) => runnerDisplayName(runner, providerConfig)));

  if (backendMode !== "local") {
    return {
      state: "demo-only",
      label: "Demo only",
      detail: "Open the native app to run Codex, Claude, or local-model seats. This browser preview can only simulate workflows.",
      tone: "review",
      liveSeatCount: 0,
      demoSeatCount: Math.max(1, demoSeats.length),
      systemSeatCount,
      runners,
      blockedSeats: ["Native Tauri backend is not connected in this browser tab."]
    };
  }

  if (workflow.nodes.length === 0) {
    return {
      state: "needs-setup",
      label: "Needs setup",
      detail: "Add at least one workflow seat before running live.",
      tone: "review",
      liveSeatCount: 0,
      demoSeatCount: 0,
      systemSeatCount: 0,
      runners: [],
      blockedSeats: ["This workflow has no seats."]
    };
  }

  if (demoSeats.length > 0) {
    const blockedSeats = demoSeats.map(({ node }) => `${node.label} needs a Codex, Claude, or local-model agent.`);
    return {
      state: "needs-setup",
      label: "Needs setup",
      detail: `Live run is blocked because ${demoSeats.map(({ node }) => node.label).join(", ")} would use demo fallback.`,
      tone: "warn",
      liveSeatCount,
      demoSeatCount: demoSeats.length,
      systemSeatCount,
      runners,
      blockedSeats
    };
  }

  const runnerIds = new Set(seatRunners.map(({ runner }) => runner));
  const unavailable: string[] = [];
  const liveRunners: string[] = [];

  if (runnerIds.has("codex")) {
    if (codexStatus.available) liveRunners.push("Codex");
    else unavailable.push("Codex CLI");
  }
  if (runnerIds.has("claude")) {
    if (claudeStatus.available) liveRunners.push("Claude");
    else unavailable.push("Claude CLI");
  }
  if (runnerIds.has("local")) {
    if (providerReadiness.canRunLive) liveRunners.push("Local model");
    else unavailable.push("Local model provider");
  }

  if (unavailable.length > 0) {
    return {
      state: "needs-setup",
      label: "Needs setup",
      detail: `${unavailable.join(", ")} must be available before this workflow can run live.`,
      tone: "warn",
      liveSeatCount,
      demoSeatCount: 0,
      systemSeatCount,
      runners,
      blockedSeats: unavailable.map((item) => `${item} is not ready for live execution.`)
    };
  }

  if (liveRunners.length === 0) {
    return {
      state: "demo-only",
      label: "Demo only",
      detail: "Assign at least one seat to Codex, Claude, or a local model for live execution.",
      tone: "review",
      liveSeatCount: 0,
      demoSeatCount: 0,
      systemSeatCount,
      runners,
      blockedSeats: ["No live workflow runner is assigned."]
    };
  }

  return {
    state: "runnable",
    label: "Runnable",
    detail: `${uniqueValues(liveRunners).join(", ")} can execute every non-system workflow seat.`,
    tone: "ok",
    liveSeatCount,
    demoSeatCount: 0,
    systemSeatCount,
    runners,
    blockedSeats: []
  };
}

function getWorkflowRunReadiness(
  workflow: WorkflowType,
  workflowAgents: AgentProfile[],
  providerConfig: ProviderConfig,
  providerReadiness: ProviderReadiness,
  codexStatus: CodexBridgeStatus,
  claudeStatus: ClaudeBridgeStatus,
  backendMode: BackendMode
): ProviderReadiness {
  const summary = getWorkflowRuntimeSummary(
    workflow,
    workflowAgents,
    providerConfig,
    providerReadiness,
    codexStatus,
    claudeStatus,
    backendMode
  );
  return {
    tone: summary.tone,
    label: summary.state === "runnable" ? "Workflow runnable" : summary.label,
    detail: summary.detail,
    runModeLabel: summary.label,
    canRunLive: summary.state === "runnable",
    issues: summary.blockedSeats
  };
}

function workflowHasCycle(workflow: WorkflowType) {
  const ids = new Set(workflow.nodes.map((node) => node.id));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const [from, to] of workflow.edges) {
    if (!ids.has(from) || !ids.has(to)) return true;
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    outgoing.set(from, [...(outgoing.get(from) ?? []), to]);
  }

  const queue = workflow.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  return visited !== workflow.nodes.length;
}

function getRunValidationChecks({
  workflow,
  agents,
  prompt,
  runtimeSummary,
  runReadiness,
  isDynamic
}: {
  workflow: WorkflowType;
  agents: AgentProfile[];
  prompt: string;
  runtimeSummary: WorkflowRuntimeSummary;
  runReadiness: ProviderReadiness;
  isDynamic: boolean;
}): RunValidationCheck[] {
  const checks: RunValidationCheck[] = [];
  const trimmedPrompt = prompt.trim();
  checks.push({
    id: "question",
    label: "Question",
    detail: trimmedPrompt ? "Council question is ready." : "Blank question will use the default project-review prompt.",
    state: trimmedPrompt ? "pass" : "warn"
  });
  checks.push({
    id: "runtime",
    label: "Runtime",
    detail: runtimeSummary.detail,
    state: runtimeSummary.state === "runnable" ? "pass" : runtimeSummary.state === "needs-setup" ? "blocked" : "warn"
  });

  if (isDynamic) {
    const missingAgents = workflow.nodes.filter((node) =>
      node.agentId && !agents.some((agent) => agent.id === node.agentId)
    );
    const modelSeats = workflow.nodes.filter((node) => node.kind !== "input" && node.kind !== "human");
    const unjoinedSeats = workflow.nodes.length > 1
      ? workflow.nodes.filter((node) => !workflow.edges.some(([from, to]) => from === node.id || to === node.id))
      : [];

    checks.push({
      id: "seats",
      label: "Seats",
      detail: workflow.nodes.length > 0 ? `${workflow.nodes.length} seats on canvas.` : "Add at least one seat to the canvas.",
      state: workflow.nodes.length > 0 ? "pass" : "blocked"
    });
    checks.push({
      id: "agents",
      label: "Agents",
      detail: missingAgents.length === 0
        ? "Assigned agents resolve correctly."
        : `${missingAgents.map((node) => node.label).join(", ")} references a missing agent.`,
      state: missingAgents.length === 0 ? "pass" : "blocked"
    });
    checks.push({
      id: "joins",
      label: "Joins",
      detail: workflowHasCycle(workflow)
        ? "Workflow joins contain a cycle."
        : unjoinedSeats.length > 0
          ? `${unjoinedSeats.map((node) => node.label).join(", ")} is not connected.`
          : modelSeats.length === 0
            ? "Add at least one non-system agent seat for useful execution."
            : "Canvas joins are runnable.",
      state: workflowHasCycle(workflow) ? "blocked" : unjoinedSeats.length > 0 || modelSeats.length === 0 ? "warn" : "pass"
    });
  } else {
    checks.push({
      id: "roster",
      label: "Council roster",
      detail: runReadiness.issues.length > 0 ? runReadiness.issues[0] : "Council seat roster is ready.",
      state: runReadiness.canRunLive ? "pass" : "warn"
    });
  }

  return checks;
}

function runSeatRunner(seatId: string, assignments: SeatAssignmentMap) {
  if (seatId === "researcher") return assignments.scan;
  if (seatId === "critic") return assignments.risk;
  if (seatId === "chair") return assignments.chair;
  if (seatId === "judge") return assignments.judge;
  return assignments.brief;
}

function workflowSeatRunnerStatus(
  runner: SeatRunner,
  providerReadiness: ProviderReadiness,
  codexStatus: CodexBridgeStatus,
  claudeStatus: ClaudeBridgeStatus,
  backendMode: BackendMode
) {
  if (runner === "system") return { tone: "ok" as const, label: "System ready" };
  if (backendMode !== "local") return { tone: "review" as const, label: "Demo preview" };
  if (runner === "demo") return { tone: "warn" as const, label: "Needs runner" };
  return seatRunnerStatus(runner, providerReadiness, codexStatus, claudeStatus);
}

function applySeatAssignmentsToRun(run: ExampleFlowRun, assignments: SeatAssignmentMap): ExampleFlowRun {
  const roster = Object.entries(councilSeatLabels)
    .map(([seatId, seat]) => `${seat.label}: ${runnerLabel(assignments[seatId as CouncilSeatId])}`)
    .join(" · ");

  return {
    ...run,
    sources: [`Seat roster: ${roster}`, ...run.sources],
    caveats: [
      "Codex, Claude, and local-model seat assignments are recorded; they execute only when their bridge/provider is available.",
      ...run.caveats
    ],
    seats: run.seats.map((seat) => {
      const runner = runSeatRunner(seat.seatId, assignments);
      const assignedRunner = `Assigned runner: ${runnerLabel(runner)}`;
      const evidence =
        seat.evidence.some((item) => item === assignedRunner || item.startsWith("Runner:"))
          ? seat.evidence
          : [assignedRunner, ...seat.evidence];
      return {
        ...seat,
        agent: runnerLabel(runner),
        evidence: evidence.slice(0, 4)
      };
    })
  };
}

function createBrowserCustomWorkflowRun(project: Project, workflow: WorkflowType, prompt: string): ExampleFlowRun {
  const startedMs = Date.now();
  const seats = workflow.nodes.map((node, index) => {
    const localReportWriter = isLocalReportWriterNode(node);
    const agent = localReportWriter
      ? "Local report writer"
      : node.agentId
        ? "Assigned agent"
        : node.kind === "input" || node.kind === "human" ? "System" : "Demo model";
    return {
      seatId: node.id,
      label: node.label,
      agent,
      role: node.role || node.kind,
      status: "done" as const,
      summary:
        node.kind === "input"
          ? "Prepared the workflow brief from the Council question and selected project context."
          : localReportWriter
            ? "Local report writer assembled the structured seat outputs into report_manifest.json, report.md, report.html, and PDF-ready HTML."
            : `Demo completed ${node.label}. Assign this seat to Codex, Claude, or a local model for live execution.`,
      evidence: [
        `Runner: ${agent}`,
        `Duration: ${localReportWriter ? "90ms" : index === 0 ? "120ms" : "560ms"}`,
        `Function: ${node.function || "No custom function set yet"}`
      ]
    };
  });
  const answerSeat = [...seats].reverse().find((seat) => seat.agent !== "Local report writer");
  const answer =
    answerSeat?.summary ??
    seats[seats.length - 1]?.summary ??
    "Add seats to this custom workflow, connect them, then run it again.";

  return {
    id: `flow-${startedMs}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    projectId: project.id,
    projectName: project.name,
    prompt,
    answer,
    guardrail: `Browser preview only: ${project.name} project guardrails are shown from indexed demo state.`,
    assumptions: [
      "This is a browser-preview workflow simulation.",
      "The Council question is separate from the workflow brief.",
      "Native execution will use the assigned seat runners."
    ],
    sources: [
      `Workflow: ${workflow.name}`,
      `Graph: ${workflow.nodes.length} seats, ${workflow.edges.length} joins`,
      `Project context: ${project.name}`
    ],
    caveats: [
      "Launch the native Tauri app to execute custom workflows through Codex, Claude, or a local model provider.",
      "Rich report assembly is local; model seats should return bounded structured content."
    ],
    confidence: 62,
    mode: "Mock",
    status: "Completed",
    startedMs,
    finishedMs: startedMs + Math.max(900, workflow.nodes.length * 520),
    summary: `Mock workflow executed ${workflow.nodes.length} seats across ${workflow.edges.length} joins.`,
    verdict: "APPROVE",
    seats
  };
}

function canvasProgressForWorkflow(progress: RunProgress | null, workflow: WorkflowType): RunProgress | null {
  if (!progress) return null;
  const canonicalNodeIds = councilRunSteps.map((step) => step.nodeId);
  const workflowNodeIds = workflow.nodes.map((node) => node.id);
  const nodeMap = new Map<string, string>(canonicalNodeIds.map((nodeId, index) => [nodeId, workflowNodeIds[index] ?? nodeId]));
  const mappedCompleted = progress.completedNodeIds
    .map((nodeId) => nodeMap.get(nodeId) ?? nodeId)
    .filter((nodeId) => workflowNodeIds.includes(nodeId));

  return {
    ...progress,
    activeNodeId: progress.activeNodeId ? nodeMap.get(progress.activeNodeId) ?? progress.activeNodeId : null,
    completedNodeIds: mappedCompleted
  };
}

function parseEvidenceDurationMs(evidence: string[]) {
  const durationLine = evidence.find((item) => item.startsWith("Duration:"));
  if (!durationLine) return null;
  const match = durationLine.match(/Duration:\s*([\d.]+)\s*(ms|s)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === "s" ? Math.round(value * 1000) : Math.round(value);
}

function formatDurationMs(ms: number) {
  if (ms >= 60_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.max(0, Math.round(ms))}ms`;
}

function seatTimingEntries(run: ExampleFlowRun) {
  return run.seats
    .map((seat) => ({
      seat,
      durationMs: parseEvidenceDurationMs(seat.evidence)
    }))
    .filter((entry): entry is { seat: ExampleFlowRun["seats"][number]; durationMs: number } => entry.durationMs !== null);
}

function evidenceValue(evidence: string[], prefix: string) {
  return evidence.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()))?.replace(new RegExp(`^${prefix}\\s*`, "i"), "").trim() ?? null;
}

function seatDurationLabel(seat: ExampleFlowRun["seats"][number]) {
  const duration = parseEvidenceDurationMs(seat.evidence);
  return duration === null ? "Not captured" : formatDurationMs(duration);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Keep the fallback when a native error payload is not serializable.
  }
  return fallback;
}

function normalizeReportSnippet(value: string) {
  return value
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSnippet(value: string, maxChars: number) {
  const normalized = normalizeReportSnippet(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}...`;
}

function seatSummaryPreview(summary: string) {
  const normalized = normalizeReportSnippet(summary);
  const withoutLabel = normalized.replace(/^Summary:\s*/i, "");
  const nextSection = withoutLabel.search(/\b(Evidence|Risk or caveat|Recommendation|Decision):/i);
  const summaryOnly = nextSection >= 0 ? withoutLabel.slice(0, nextSection).trim() : withoutLabel;
  return compactSnippet(summaryOnly || normalized, 360);
}

function runReportMarkdown(run: ExampleFlowRun) {
  const lines = [
    `# ${run.workflowName}`,
    "",
    `Project: ${run.projectName}`,
    `Mode: ${run.mode}`,
    `Verdict: ${run.verdict}`,
    `Confidence: ${run.confidence}%`,
    `Duration: ${formatDurationMs(Math.max(0, run.finishedMs - run.startedMs))}`,
    "",
    "## Council Question",
    run.prompt,
    "",
    "## Council Answer",
    run.answer,
    "",
    "## Project Guardrail",
    run.guardrail,
    "",
    "## Summary",
    run.summary,
    "",
    "## Assumptions",
    ...run.assumptions.map((item) => `- ${item}`),
    "",
    "## Inputs and Evidence",
    ...run.sources.map((item) => `- ${item}`),
    "",
    "## Caveats",
    ...run.caveats.map((item) => `- ${item}`),
    "",
    "## Seats",
    ...run.seats.flatMap((seat) => [
      `### ${seat.label}`,
      `Runner: ${seat.agent}`,
      `Role: ${seat.role}`,
      "",
      seat.summary,
      "",
      ...seat.evidence.map((item) => `- ${item}`),
      ""
    ])
  ];

  return `${lines.join("\n").trim()}\n`;
}

function downloadRunReport(run: ExampleFlowRun) {
  const blob = new Blob([runReportMarkdown(run)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${workflowSlug(run.workflowName) || "workflow-report"}-${run.id}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyRunReport(run: ExampleFlowRun) {
  await navigator.clipboard.writeText(runReportMarkdown(run));
}

function riskTone(risk: RiskState) {
  if (risk === "Clear") return "ok";
  if (risk === "Needs agent file") return "warn";
  if (risk === "Secret flagged") return "danger";
  return "review";
}

function gitTone(git: GitState) {
  if (git === "Clean") return "ok";
  if (git === "Dirty") return "warn";
  return "review";
}

function AppShell({
  active,
  onNavigate,
  children
}: {
  active: NavItem;
  onNavigate: (nav: NavItem) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Primary navigation">
        <button className="brand" type="button" onClick={() => onNavigate("command")}>
          <span className="brand-mark">
            <Command size={18} strokeWidth={2.4} />
          </span>
          <span>
            <strong>AI Command</strong>
            <small>Central</small>
          </span>
        </button>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cx("nav-item", active === item.id && "is-active")}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="local-card">
          <span className="local-card-icon">
            <ShieldCheck size={16} />
          </span>
          <strong>Local-first</strong>
          <p>No telemetry. Repos are read for state, not uploaded.</p>
        </div>
      </aside>
      {children}
    </div>
  );
}

function TopBar({
  query,
  setQuery,
  onScan,
  isScanning
}: {
  query: string;
  setQuery: (query: string) => void;
  onScan: () => void | Promise<void>;
  isScanning: boolean;
}) {
  return (
    <header className="top-bar">
      <div className="search-box">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search projects, workflows, runs..." />
        {query && (
          <button className="search-clear" type="button" aria-label="Clear search" title="Clear search" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <button className="ghost-button" type="button">
        <Database size={16} />
        Sources
      </button>
      <button className="primary-button" type="button" onClick={onScan} disabled={isScanning}>
        <RotateCcw size={16} />
        {isScanning ? "Scanning..." : "Scan now"}
      </button>
    </header>
  );
}

function CommandCenter({
  projects,
  selected,
  selectProject,
  openWorkflows,
  runCount
}: {
  projects: Project[];
  selected: Project;
  selectProject: (project: Project) => void;
  openWorkflows: (project?: Project) => void;
  runCount: number;
}) {
  const attention = projects.filter((project) => project.git === "Dirty" || project.risk !== "Clear");
  const active = projects.filter((project) => project.status === "Active");

  return (
    <section className="command-grid">
      <div className="hero-panel">
        <div>
          <p className="section-kicker">Today</p>
          <h1>Know what needs attention before opening a terminal.</h1>
          <p>
            AI Command Central keeps local project state, agent readiness, and workflow runs in one command surface.
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary-button large" type="button" onClick={() => openWorkflows(selected)}>
            <Sparkles size={18} />
            Analyze selected project
          </button>
          <button className="ghost-button large" type="button">
            <Terminal size={18} />
            Open terminal
          </button>
        </div>
      </div>

      <div className="metric-row">
        <Metric label="Projects" value={projects.length.toString()} detail="indexed locally" icon={FolderOpen} />
        <Metric label="Active" value={active.length.toString()} detail="recent or dirty" icon={Activity} tone="ok" />
        <Metric label="Needs attention" value={attention.length.toString()} detail="git or setup issue" icon={AlertTriangle} tone="warn" />
        <Metric label="Recent runs" value={runCount.toString()} detail="workflow history" icon={MonitorPlay} />
      </div>

      <div className="attention-panel">
        <PanelHeader title="Needs attention" action="Review all" />
        <div className="attention-list">
          {attention.slice(0, 4).map((project) => (
            <button
              key={project.id}
              type="button"
              className={cx("attention-row", selected.id === project.id && "is-selected")}
              onClick={() => selectProject(project)}
            >
              <span className={cx("status-dot", riskTone(project.risk))} />
              <span>
                <strong>{project.name}</strong>
                <small>{project.risk === "Clear" ? project.git : project.risk}</small>
              </span>
              <span>{project.activity}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="run-panel">
        <PanelHeader title="Latest workflow run" action="View report" />
        <Timeline steps={timelineFromProgress(null, true)} />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof FolderOpen;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className={cx("metric-card", tone && `tone-${tone}`)}>
      <span className="metric-icon">
        <Icon size={18} />
      </span>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}

function PanelHeader({
  title,
  action,
  onAction
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action}
          <ChevronDown size={14} />
        </button>
      )}
    </div>
  );
}

function ProjectWorkbench({
  projects,
  selected,
  selectProject,
  query,
  filter,
  setFilter,
  onResetView,
  onAnalyze,
  onOpenProject,
  onOpenTerminal,
  backendMode,
  agentFilePreview,
  isPreparingAgentFile,
  isWritingAgentFile,
  onPreviewAgentFile,
  onCreateAgentFile,
  onCloseAgentFilePreview,
  onToast
}: {
  projects: Project[];
  selected: Project;
  selectProject: (project: Project) => void;
  query: string;
  filter: ProjectFilter;
  setFilter: (filter: ProjectFilter) => void;
  onResetView: () => void;
  onAnalyze: (project: Project) => void;
  onOpenProject: (project: Project) => void | Promise<void>;
  onOpenTerminal: (project: Project) => void | Promise<void>;
  backendMode: BackendMode;
  agentFilePreview: AgentFilePreview | null;
  isPreparingAgentFile: boolean;
  isWritingAgentFile: boolean;
  onPreviewAgentFile: (project: Project) => void | Promise<void>;
  onCreateAgentFile: (project: Project, content: string) => void | Promise<void>;
  onCloseAgentFilePreview: () => void;
  onToast: (message: string, undo?: string) => void;
}) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesSearch =
        !q ||
        project.name.toLowerCase().includes(q) ||
        project.path.toLowerCase().includes(q) ||
        project.nextTask.toLowerCase().includes(q);
      const matchesFilter =
        filter === "All" ||
        (filter === "Needs attention" && (project.git === "Dirty" || project.risk !== "Clear")) ||
        (filter === "Active" && project.status === "Active") ||
        (filter === "Dirty git" && project.git === "Dirty") ||
        (filter === "Security" && project.risk === "Secret flagged") ||
        (filter === "No agent file" && project.risk === "Needs agent file");
      return matchesSearch && matchesFilter;
    });
  }, [filter, projects, query]);
  const visibleSelected = visible.find((project) => project.id === selected.id) ?? visible[0];

  return (
    <section className="workbench">
      <div className="workbench-main">
        <div className="filter-bar" aria-label="Project filters">
          {filterOptions.map((item) => (
            <button key={item} className={cx(filter === item && "is-active")} type="button" onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="project-table-shell">
          <div className="table-header">
            <span>Project</span>
            <span>Agents</span>
            <span>Git</span>
            <span>Activity</span>
            <span>Risk</span>
            <span>Next task</span>
          </div>
          <div className="project-table" role="table" aria-label="Projects">
            {visible.length === 0 ? (
              <div className="empty-state">
                <span>
                  <Archive size={18} />
                </span>
                <strong>No projects match this view</strong>
                <small>Clear the search or switch filters to widen the project list.</small>
                <button type="button" onClick={onResetView}>
                  Show all projects
                </button>
              </div>
            ) : (
              visible.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={cx("project-row", visibleSelected?.id === project.id && "is-selected")}
                  onClick={() => selectProject(project)}
                >
                  <span className="project-name">
                    <strong>{project.name}</strong>
                    <small>{project.path}</small>
                  </span>
                  <span className="agent-stack">
                    {project.agents.map((agent) => (
                      <AgentChip key={agent} agent={agent} />
                    ))}
                  </span>
                  <StatusPill tone={gitTone(project.git)}>{project.git}</StatusPill>
                  <span className="muted">{project.activity}</span>
                  <StatusPill tone={riskTone(project.risk)}>{project.risk}</StatusPill>
                  <span className="next-task">{project.nextTask}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {visibleSelected ? (
        <ProjectDrawer
          project={visibleSelected}
          backendMode={backendMode}
          agentFilePreview={agentFilePreview?.projectId === visibleSelected.id ? agentFilePreview : null}
          isPreparingAgentFile={isPreparingAgentFile}
          isWritingAgentFile={isWritingAgentFile}
          onAnalyze={() => onAnalyze(visibleSelected)}
          onOpenProject={() => onOpenProject(visibleSelected)}
          onOpenTerminal={() => onOpenTerminal(visibleSelected)}
          onPreviewAgentFile={() => onPreviewAgentFile(visibleSelected)}
          onCreateAgentFile={(content) => onCreateAgentFile(visibleSelected, content)}
          onCloseAgentFilePreview={onCloseAgentFilePreview}
          onToast={onToast}
        />
      ) : (
        <aside className="detail-drawer empty-drawer">
          <span>
            <Archive size={18} />
          </span>
          <h2>No project selected</h2>
          <p>Broaden the current view to bring a project back into focus.</p>
          <button className="primary-button" type="button" onClick={onResetView}>
            Show all projects
          </button>
        </aside>
      )}
    </section>
  );
}

function AgentChip({ agent }: { agent: Agent }) {
  return <span className={cx("agent-chip", agent.toLowerCase())}>{agent}</span>;
}

function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cx("status-pill", tone)}>{children}</span>;
}

function ProjectDrawer({
  project,
  backendMode,
  agentFilePreview,
  isPreparingAgentFile,
  isWritingAgentFile,
  onAnalyze,
  onOpenProject,
  onOpenTerminal,
  onPreviewAgentFile,
  onCreateAgentFile,
  onCloseAgentFilePreview,
  onToast
}: {
  project: Project;
  backendMode: BackendMode;
  agentFilePreview: AgentFilePreview | null;
  isPreparingAgentFile: boolean;
  isWritingAgentFile: boolean;
  onAnalyze: () => void;
  onOpenProject: () => void | Promise<void>;
  onOpenTerminal: () => void | Promise<void>;
  onPreviewAgentFile: () => void | Promise<void>;
  onCreateAgentFile: (content: string) => void | Promise<void>;
  onCloseAgentFilePreview: () => void;
  onToast: (message: string, undo?: string) => void;
}) {
  return (
    <aside className="detail-drawer">
      <div className="drawer-title">
        <span className={cx("status-dot", project.status === "Active" ? "ok" : project.status === "Recent" ? "review" : "idle")} />
        <div>
          <h2>{project.name}</h2>
          <p>{project.path}</p>
        </div>
      </div>

      <div className="summary-strip">
        <span>
          <GitBranch size={14} />
          {project.git}
        </span>
        <span>
          <Bot size={14} />
          {project.agents.length} agents
        </span>
        <span>
          <Clock3 size={14} />
          {project.activity}
        </span>
      </div>

      <ActionGroup title="Open">
        <button type="button" onClick={onOpenProject}>
          <Code2 size={16} />
          Folder
        </button>
        <button type="button" onClick={onOpenTerminal}>
          <Terminal size={16} />
          Terminal
        </button>
      </ActionGroup>

      <ActionGroup title="Run">
        {project.agents.map((agent) => (
          <button key={agent} type="button" onClick={() => onToast(`Launching ${agent} for ${project.name}`)}>
            <Play size={16} />
            {agent}
          </button>
        ))}
      </ActionGroup>

      <ActionGroup title="Analyze">
        <button className="accent-action" type="button" onClick={onAnalyze}>
          <Sparkles size={16} />
          Analyze with workflow
        </button>
      </ActionGroup>

      <ProjectReadiness
        project={project}
        backendMode={backendMode}
        preview={agentFilePreview}
        isPreparing={isPreparingAgentFile}
        isWriting={isWritingAgentFile}
        onPreview={onPreviewAgentFile}
        onCreate={onCreateAgentFile}
        onClose={onCloseAgentFilePreview}
      />

      <div className="drawer-section">
        <h3>Next task</h3>
        <p className="task-note">{project.nextTask}</p>
      </div>

      <div className="drawer-section">
        <h3>Recent files</h3>
        <ul className="file-list">
          {project.recentFiles.map((file) => (
            <li key={file}>
              <FileText size={14} />
              {file}
            </li>
          ))}
        </ul>
      </div>

      <div className="drawer-section">
        <h3>Run timeline</h3>
        <Timeline steps={timelineFromProgress(null, true)} compact />
      </div>
    </aside>
  );
}

function ProjectReadiness({
  project,
  backendMode,
  preview,
  isPreparing,
  isWriting,
  onPreview,
  onCreate,
  onClose
}: {
  project: Project;
  backendMode: BackendMode;
  preview: AgentFilePreview | null;
  isPreparing: boolean;
  isWriting: boolean;
  onPreview: () => void | Promise<void>;
  onCreate: (content: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const needsAgentFile = project.risk === "Needs agent file";
  const hasAgentFile = !needsAgentFile && (project.agents.includes("Codex") || project.recentFiles.includes("AGENTS.md"));
  const canWrite = backendMode === "local" && preview && !preview.exists;

  return (
    <div className={cx("readiness-card", needsAgentFile && "needs-action", hasAgentFile && "is-ready")}>
      <div className="readiness-head">
        <span>
          <ShieldCheck size={16} />
        </span>
        <div>
          <strong>Agent context</strong>
          <small>
            {hasAgentFile
              ? "AGENTS.md or Codex context is already detected."
              : "Create a reviewed context file before broad agent work."}
          </small>
        </div>
        <StatusPill tone={hasAgentFile ? "ok" : needsAgentFile ? "warn" : "review"}>
          {hasAgentFile ? "Ready" : "Needs review"}
        </StatusPill>
      </div>

      {needsAgentFile && (
        <button className="readiness-action" type="button" onClick={onPreview} disabled={isPreparing}>
          <FileText size={15} />
          {isPreparing ? "Preparing preview..." : preview ? "Refresh AGENTS.md preview" : "Review AGENTS.md preview"}
        </button>
      )}

      {preview && (
        <div className="agent-file-preview">
          <div className="preview-toolbar">
            <span>{preview.filePath}</span>
            <small>{preview.lineCount} lines</small>
          </div>
          <pre>{preview.content}</pre>
          <div className="preview-actions">
            <button type="button" onClick={onClose}>Close preview</button>
            <button
              className="accent-action"
              type="button"
              disabled={!canWrite || isWriting}
              onClick={() => onCreate(preview.content)}
            >
              <Check size={15} />
              {backendMode !== "local"
                ? "Native app required"
                : preview.exists
                  ? "Already exists"
                  : isWriting
                    ? "Creating..."
                    : "Create AGENTS.md"}
            </button>
          </div>
          <p className="preview-note">
            {backendMode === "local"
              ? "This writes only after this approval action and refuses to overwrite an existing file."
              : "Browser demo can preview the file. Local writes are enabled in the native app."}
          </p>
        </div>
      )}
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="action-group">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Timeline({ steps, compact = false }: { steps: TimelineStep[]; compact?: boolean }) {
  return (
    <ol className={cx("timeline", compact && "is-compact")}>
      {steps.map((step) => (
        <li key={step.label} className={step.state}>
          <span className="timeline-node">{step.state === "done" ? <Check size={12} /> : <CircleDot size={12} />}</span>
          <span>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RuntimePill({ summary }: { summary: WorkflowRuntimeSummary }) {
  return (
    <span className={cx("runtime-pill", `is-${summary.state}`)}>
      {summary.label}
    </span>
  );
}

function RuntimeSummaryPanel({ summary }: { summary: WorkflowRuntimeSummary }) {
  return (
    <section className={cx("runtime-summary-panel", `is-${summary.state}`)} aria-label="Workflow runtime status">
      <div className="runtime-summary-main">
        <RuntimePill summary={summary} />
        <strong>{summary.detail}</strong>
      </div>
      <div className="runtime-summary-counts">
        <span>Live {summary.liveSeatCount}</span>
        <span>Demo {summary.demoSeatCount}</span>
        <span>System {summary.systemSeatCount}</span>
      </div>
      {summary.runners.length > 0 && <small>{summary.runners.join(" · ")}</small>}
    </section>
  );
}

function RunnerHealthPanel({
  backendMode,
  providerReadiness,
  codexBridgeStatus,
  claudeBridgeStatus,
  runReadiness
}: {
  backendMode: BackendMode;
  providerReadiness: ProviderReadiness;
  codexBridgeStatus: CodexBridgeStatus;
  claudeBridgeStatus: ClaudeBridgeStatus;
  runReadiness: ProviderReadiness;
}) {
  const items: Array<{ label: string; tone: ProviderReadiness["tone"]; detail: string }> = [
    {
      label: "Native backend",
      tone: backendMode === "local" ? "ok" : "review",
      detail: backendMode === "local" ? "Connected" : "Browser preview"
    },
    {
      label: "Codex",
      tone: codexBridgeStatus.available ? "ok" : "review",
      detail: codexBridgeStatus.available ? codexBridgeStatus.detail : "CLI unavailable"
    },
    {
      label: "Claude",
      tone: claudeBridgeStatus.available ? "ok" : "review",
      detail: claudeBridgeStatus.available ? claudeBridgeStatus.detail : "CLI unavailable"
    },
    {
      label: "Local model",
      tone: providerReadiness.canRunLive ? "ok" : providerReadiness.tone,
      detail: providerReadiness.runModeLabel
    },
    {
      label: "Artifacts",
      tone: backendMode === "local" ? "ok" : "review",
      detail: backendMode === "local" ? "Saved per run" : "Native only"
    }
  ];

  return (
    <section className="runner-health-panel" aria-label="Runner health and live proof">
      <div>
        <h2>Runner health</h2>
        <p>{runReadiness.canRunLive ? "Live execution is available for this workflow." : runReadiness.detail}</p>
      </div>
      <div className="runner-health-grid">
        {items.map((item) => (
          <div key={item.label} className={cx("runner-health-item", item.tone)}>
            <span className={cx("status-dot", providerToneDot(item.tone))} />
            <strong>{item.label}</strong>
            <small>{compactSnippet(item.detail, 70)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function RunValidationPanel({ checks }: { checks: RunValidationCheck[] }) {
  const blockers = checks.filter((check) => check.state === "blocked").length;
  const warnings = checks.filter((check) => check.state === "warn").length;
  return (
    <section className="run-validation-panel" aria-label="Pre-run validation">
      <div className="run-validation-head">
        <div>
          <h2>Pre-run checks</h2>
          <p>{blockers > 0 ? `${blockers} blocker${blockers === 1 ? "" : "s"} before live execution` : warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"} to review` : "Ready to run"}</p>
        </div>
        <StatusPill tone={blockers > 0 ? "warn" : warnings > 0 ? "review" : "ok"}>
          {blockers > 0 ? "Blocked" : warnings > 0 ? "Review" : "Ready"}
        </StatusPill>
      </div>
      <div className="run-validation-grid">
        {checks.map((check) => (
          <div key={check.id} className={cx("run-validation-item", check.state)}>
            <span className={cx("status-dot", check.state === "pass" ? "ok" : check.state === "blocked" ? "warn" : "review")} />
            <div>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowStudio({
  selectedProject,
  selectedWorkflow,
  availableWorkflows,
  availableAgents,
  setSelectedWorkflow,
  onCreateWorkflow,
  onUpdateWorkflow,
  onDeleteWorkflow,
  live,
  setLive,
  backendMode,
  providerConfig,
  providerReadiness,
  runReadiness,
  codexBridgeStatus,
  claudeBridgeStatus,
  seatAssignments,
  onSeatAssignmentChange,
  councilPrompt,
  setCouncilPrompt,
  latestFlowRun,
  runProgress,
  runEventLog,
  isRunningFlow,
  isCancellingFlow,
  onRunWorkflow,
  onCancelWorkflow,
  onOpenRunArtifactFolder
}: {
  selectedProject: Project;
  selectedWorkflow: WorkflowType;
  availableWorkflows: WorkflowType[];
  availableAgents: AgentProfile[];
  setSelectedWorkflow: (workflow: WorkflowType) => void;
  onCreateWorkflow: (draft: WorkflowDraft) => void;
  onUpdateWorkflow: (workflow: WorkflowType) => void;
  onDeleteWorkflow: (workflowId: string) => void;
  live: boolean;
  setLive: (live: boolean) => void;
  backendMode: BackendMode;
  providerConfig: ProviderConfig;
  providerReadiness: ProviderReadiness;
  runReadiness: ProviderReadiness;
  codexBridgeStatus: CodexBridgeStatus;
  claudeBridgeStatus: ClaudeBridgeStatus;
  seatAssignments: SeatAssignmentMap;
  onSeatAssignmentChange: (seatId: CouncilSeatId, runner: SeatRunner) => void;
  councilPrompt: string;
  setCouncilPrompt: (prompt: string) => void;
  latestFlowRun: ExampleFlowRun | null;
  runProgress: RunProgress | null;
  runEventLog: RunLogEntry[];
  isRunningFlow: boolean;
  isCancellingFlow: boolean;
  onRunWorkflow: () => void | Promise<void>;
  onCancelWorkflow: () => void | Promise<void>;
  onOpenRunArtifactFolder: (run: ExampleFlowRun) => void;
}) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const visibleRun = !isRunningFlow && latestFlowRun?.projectId === selectedProject.id ? latestFlowRun : null;
  const selectedWorkflowIsCustom = isCustomWorkflow(selectedWorkflow);
  const selectedWorkflowIsDynamic = isDynamicWorkflow(selectedWorkflow);
  const runtimeSteps = selectedWorkflowIsDynamic
    ? timelineFromWorkflowProgress(runProgress, selectedWorkflow, Boolean(visibleRun))
    : timelineFromProgress(runProgress, Boolean(visibleRun));
  const canvasProgress = canvasProgressForWorkflow(runProgress, selectedWorkflow);
  const canRunLive = runReadiness.canRunLive;
  const runUsesLiveRunners = canRunLive && live;
  const selectedRuntimeSummary = selectedWorkflowIsDynamic
    ? getWorkflowRuntimeSummary(
        selectedWorkflow,
        availableAgents,
        providerConfig,
        providerReadiness,
        codexBridgeStatus,
        claudeBridgeStatus,
        backendMode
      )
    : runtimeSummaryFromCouncilReadiness(runReadiness, seatAssignments, providerConfig);
  const validationChecks = getRunValidationChecks({
    workflow: selectedWorkflow,
    agents: availableAgents,
    prompt: councilPrompt,
    runtimeSummary: selectedRuntimeSummary,
    runReadiness,
    isDynamic: selectedWorkflowIsDynamic
  });

  useEffect(() => {
    if (!visibleRun) return;
    window.requestAnimationFrame(() => {
      document.getElementById("latest-flow-report")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [visibleRun?.id]);

  return (
    <section className="workflow-studio">
      <div className="workflow-gallery">
        <PanelHeader
          title="Workflow templates"
          action={isComposerOpen ? "Close" : "New workflow"}
          onAction={() => setIsComposerOpen((current) => !current)}
        />
        {isComposerOpen && (
          <WorkflowComposer
            onCancel={() => setIsComposerOpen(false)}
            onCreate={(draft) => {
              onCreateWorkflow(draft);
              setIsComposerOpen(false);
            }}
          />
        )}
        <div className="workflow-cards">
          {availableWorkflows.map((workflow) => {
            const workflowSummary = isDynamicWorkflow(workflow)
              ? getWorkflowRuntimeSummary(
                  workflow,
                  availableAgents,
                  providerConfig,
                  providerReadiness,
                  codexBridgeStatus,
                  claudeBridgeStatus,
                  backendMode
                )
              : runtimeSummaryFromCouncilReadiness(
                  getCouncilRunReadiness(seatAssignments, providerReadiness, codexBridgeStatus, claudeBridgeStatus, backendMode),
                  seatAssignments,
                  providerConfig
                );

            return (
              <article
                key={workflow.id}
                className={cx("workflow-card", workflow.id === selectedWorkflow.id && "is-selected")}
              >
                <button type="button" onClick={() => setSelectedWorkflow(workflow)}>
                  <strong>{workflow.name}</strong>
                  <span>{workflow.description}</span>
                  <span className="workflow-card-meta">
                    <small>{workflow.seats} seats · {workflow.runTime}</small>
                    <RuntimePill summary={workflowSummary} />
                  </span>
                </button>
                {isCustomWorkflow(workflow) && (
                  <button
                    type="button"
                    className="workflow-delete-button"
                    aria-label={`Delete ${workflow.name}`}
                    onClick={() => onDeleteWorkflow(workflow.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="workflow-canvas-panel">
        <div className="studio-toolbar">
          <div>
            <p className="section-kicker">Scoped to {selectedProject.name}</p>
            <h1>{selectedWorkflow.name}</h1>
          </div>
          <label className="mode-toggle">
            <input
              checked={runUsesLiveRunners}
              disabled={!canRunLive}
              onChange={(event) => setLive(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{runUsesLiveRunners ? "Live run" : "Demo run"}</span>
          </label>
          <span className={cx("demo-mode-note", canRunLive && "is-ready", runUsesLiveRunners && "is-live")}>
            {runUsesLiveRunners
              ? "Assigned seats are executing"
              : canRunLive
                ? "Switch on for live seats"
                : runReadiness.runModeLabel}
          </span>
          <button
            type="button"
            className="primary-button"
            onClick={onRunWorkflow}
            disabled={isRunningFlow}
          >
            <Play size={16} />
            {isRunningFlow ? "Running..." : runUsesLiveRunners ? "Run live" : "Run demo"}
          </button>
          {isRunningFlow && (
            <button
              type="button"
              className="danger-button"
              onClick={onCancelWorkflow}
              disabled={isCancellingFlow}
            >
              <X size={15} />
              {isCancellingFlow ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
        <div className={cx("provider-banner", runReadiness.tone)}>
          <span className={cx("status-dot", providerToneDot(runReadiness.tone))} />
          <strong>{runReadiness.label}</strong>
          <small>{runReadiness.detail}</small>
        </div>
        <RunnerHealthPanel
          backendMode={backendMode}
          providerReadiness={providerReadiness}
          codexBridgeStatus={codexBridgeStatus}
          claudeBridgeStatus={claudeBridgeStatus}
          runReadiness={runReadiness}
        />
        <RuntimeSummaryPanel summary={selectedRuntimeSummary} />
        <RunValidationPanel checks={validationChecks} />
        {selectedWorkflowIsDynamic ? (
          <WorkflowRunnerPanel
            workflow={selectedWorkflow}
            agents={availableAgents}
            providerConfig={providerConfig}
            providerReadiness={providerReadiness}
            codexBridgeStatus={codexBridgeStatus}
            claudeBridgeStatus={claudeBridgeStatus}
            backendMode={backendMode}
          />
        ) : (
          <SeatAssignmentPanel
            assignments={seatAssignments}
            providerReadiness={providerReadiness}
            codexBridgeStatus={codexBridgeStatus}
            claudeBridgeStatus={claudeBridgeStatus}
            onChange={onSeatAssignmentChange}
          />
        )}
        <label className="council-brief">
          <span>Ask the Council</span>
          <textarea
            value={councilPrompt}
            onChange={(event) => setCouncilPrompt(event.currentTarget.value)}
            placeholder="Ask what you want the Council to decide before agents act..."
            rows={3}
          />
        </label>
        {isRunningFlow && runProgress && <RunProgressPanel progress={runProgress} />}
        <ExecutionLogPanel entries={runEventLog} isRunning={isRunningFlow} />
        {selectedWorkflowIsCustom ? (
          <WorkflowBuilder
            workflow={selectedWorkflow}
            agents={availableAgents}
            onUpdateWorkflow={onUpdateWorkflow}
          />
        ) : (
          <WorkflowCanvas workflow={selectedWorkflow} progress={canvasProgress} hasCompletedRun={Boolean(visibleRun)} />
        )}
        <div className="studio-footer">
          <Timeline steps={runtimeSteps} />
        </div>
        {visibleRun && <FlowReport run={visibleRun} onOpenRunArtifactFolder={onOpenRunArtifactFolder} />}
      </div>
    </section>
  );
}

function WorkflowComposer({
  onCreate,
  onCancel
}: {
  onCreate: (draft: WorkflowDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<WorkflowDraft>({
    name: "Custom Agent Flow",
    purpose: "Drop agents onto the canvas, connect them, and define each seat's function.",
    pattern: "blank"
  });
  const canCreate = draft.name.trim().length > 2;

  return (
    <form
      className="workflow-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) onCreate(draft);
      }}
    >
      <label>
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => {
            const name = event.currentTarget.value;
            setDraft((current) => ({ ...current, name }));
          }}
          placeholder="Workflow name"
        />
      </label>
      <label>
        <span>Pattern</span>
        <select
          value={draft.pattern}
          onChange={(event) => {
            const pattern = event.currentTarget.value as WorkflowPattern;
            setDraft((current) => ({ ...current, pattern }));
          }}
        >
          {workflowPatternOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="workflow-purpose-field">
        <span>Purpose</span>
        <textarea
          value={draft.purpose}
          onChange={(event) => {
            const purpose = event.currentTarget.value;
            setDraft((current) => ({ ...current, purpose }));
          }}
          placeholder="What should this workflow decide or produce?"
          rows={3}
        />
      </label>
      <p>
        {workflowPatternOptions.find((option) => option.id === draft.pattern)?.detail}
      </p>
      <div className="workflow-composer-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={!canCreate}>
          <Plus size={15} />
          Create
        </button>
      </div>
    </form>
  );
}

function WorkflowBuilder({
  workflow,
  agents,
  onUpdateWorkflow
}: {
  workflow: WorkflowType;
  agents: AgentProfile[];
  onUpdateWorkflow: (workflow: WorkflowType) => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(workflow.nodes[0]?.id ?? null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [pointerAgentId, setPointerAgentId] = useState<string | null>(null);
  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const canvasWidth = 740;
  const canvasHeight = 300;

  useEffect(() => {
    if (selectedNodeId && workflow.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(workflow.nodes[0]?.id ?? null);
  }, [selectedNodeId, workflow.id, workflow.nodes]);

  function commit(next: WorkflowType) {
    onUpdateWorkflow(workflowWithSeatCount(next));
  }

  function addAgentNode(agent: AgentProfile, point?: { x: number; y: number }) {
    const index = workflow.nodes.length;
    const node = {
      id: `node-${Date.now().toString(36)}-${index}`,
      label: agent.name,
      x: Math.max(18, Math.min(canvasWidth - 132, point?.x ?? 64 + index * 56)),
      y: Math.max(18, Math.min(canvasHeight - 82, point?.y ?? 64 + (index % 3) * 68)),
      kind: workflowNodeKindForAgent(agent),
      agentId: agent.id,
      role: agent.role,
      function: `Use ${agent.name} to ${agent.role.toLowerCase()}.`
    } satisfies WorkflowType["nodes"][number];
    commit({ ...workflow, nodes: [...workflow.nodes, node] });
    setSelectedNodeId(node.id);
  }

  function updateNode(nodeId: string, patch: Partial<WorkflowType["nodes"][number]>) {
    commit({
      ...workflow,
      nodes: workflow.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    });
  }

  function deleteNode(nodeId: string) {
    commit({
      ...workflow,
      nodes: workflow.nodes.filter((node) => node.id !== nodeId),
      edges: workflow.edges.filter(([from, to]) => from !== nodeId && to !== nodeId)
    });
    setConnectionSourceId((current) => (current === nodeId ? null : current));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  }

  function connectNodes(from: string, to: string) {
    if (from === to) return;
    const exists = workflow.edges.some(([edgeFrom, edgeTo]) => edgeFrom === from && edgeTo === to);
    if (exists) return;
    if (wouldCreateCycle(from, to)) return;
    commit({ ...workflow, edges: [...workflow.edges, [from, to]] });
  }

  function wouldCreateCycle(from: string, to: string) {
    const outgoing = new Map<string, string[]>();
    [...workflow.edges, [from, to] as [string, string]].forEach(([edgeFrom, edgeTo]) => {
      outgoing.set(edgeFrom, [...(outgoing.get(edgeFrom) ?? []), edgeTo]);
    });
    const seen = new Set<string>();
    const stack = [to];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current)) continue;
      if (current === from) return true;
      seen.add(current);
      stack.push(...(outgoing.get(current) ?? []));
    }
    return false;
  }

  function deleteEdge(from: string, to: string) {
    commit({
      ...workflow,
      edges: workflow.edges.filter(([edgeFrom, edgeTo]) => edgeFrom !== from || edgeTo !== to)
    });
  }

  function moveNode(nodeId: string, x: number, y: number) {
    commit({
      ...workflow,
      nodes: workflow.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
    });
  }

  function startAgentDrag(event: React.DragEvent<HTMLElement>, agentId: string) {
    event.dataTransfer.setData("application/x-agent-id", agentId);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleNodeClick(nodeId: string) {
    if (connectionSourceId && connectionSourceId !== nodeId) {
      connectNodes(connectionSourceId, nodeId);
      setConnectionSourceId(null);
      setSelectedNodeId(nodeId);
      return;
    }
    setSelectedNodeId(nodeId);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const agentId = event.dataTransfer.getData("application/x-agent-id");
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;

    const rect = event.currentTarget.getBoundingClientRect();
    addAgentNode(agent, {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth - 56,
      y: ((event.clientY - rect.top) / rect.height) * canvasHeight - 31
    });
  }

  function handleCanvasMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (!pointerAgentId) return;
    const agent = agents.find((candidate) => candidate.id === pointerAgentId);
    setPointerAgentId(null);
    if (!agent) return;

    const rect = event.currentTarget.getBoundingClientRect();
    addAgentNode(agent, {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth - 56,
      y: ((event.clientY - rect.top) / rect.height) * canvasHeight - 31
    });
  }

  return (
    <section className="workflow-builder" aria-label="Workflow builder">
      <div className="builder-palette">
        <div className="builder-section-head">
          <h2>Agent library</h2>
          <span>{agents.length} available</span>
        </div>
        <div className="builder-agent-list">
          {agents.map((agent) => (
            <article
              key={agent.id}
              className="builder-agent-card"
              draggable
              onDragStart={(event) => startAgentDrag(event, agent.id)}
            >
              <button
                type="button"
                draggable
                onClick={() => {
                  setPointerAgentId(null);
                  addAgentNode(agent);
                }}
                onDragStart={(event) => startAgentDrag(event, agent.id)}
                onMouseDown={() => setPointerAgentId(agent.id)}
              >
                <strong>{agent.name}</strong>
                <small>{agent.role}</small>
              </button>
              <span>{agent.authority}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="builder-canvas-panel">
        <div className="builder-section-head">
          <h2>Canvas</h2>
          <span>{workflow.nodes.length} seats · {workflow.edges.length} joins</span>
        </div>
        <WorkflowCanvas
          workflow={workflow}
          progress={null}
          hasCompletedRun={false}
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
          onConnectNodes={connectNodes}
          onMoveNode={moveNode}
          onCanvasDrop={handleDrop}
          onCanvasDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onCanvasMouseUp={handleCanvasMouseUp}
        />
      </div>

      <div className="builder-inspector">
        <div className="builder-section-head">
          <h2>Seat setup</h2>
          {connectionSourceId && <span>Joining from {workflow.nodes.find((node) => node.id === connectionSourceId)?.label}</span>}
        </div>
        <div className="builder-workflow-settings">
          <label>
            <span>Workflow name</span>
            <input
              value={workflow.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                commit({ ...workflow, name });
              }}
            />
          </label>
          <label>
            <span>Workflow purpose</span>
            <textarea
              value={workflow.description}
              onChange={(event) => {
                const description = event.currentTarget.value;
                commit({ ...workflow, description });
              }}
              rows={3}
            />
          </label>
        </div>
        {selectedNode ? (
          <div className="builder-fields">
            <label>
              <span>Assigned agent</span>
              <select
                value={selectedNode.agentId ?? ""}
                onChange={(event) => {
                  const agentId = event.currentTarget.value;
                  const agent = agents.find((candidate) => candidate.id === agentId);
                  updateNode(
                    selectedNode.id,
                    agent
                      ? {
                          agentId: agent.id,
                          label: selectedNode.label || agent.name,
                          role: selectedNode.role || agent.role,
                          function: selectedNode.function || `Use ${agent.name} to ${agent.role.toLowerCase()}.`,
                          kind: workflowNodeKindForAgent(agent)
                        }
                      : { agentId: undefined }
                  );
                }}
              >
                <option value="">No assigned agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} · {agent.model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Label</span>
              <input
                value={selectedNode.label}
                onChange={(event) => updateNode(selectedNode.id, { label: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>Role</span>
              <input
                value={selectedNode.role ?? ""}
                onChange={(event) => updateNode(selectedNode.id, { role: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>Function</span>
              <textarea
                value={selectedNode.function ?? ""}
                onChange={(event) => updateNode(selectedNode.id, { function: event.currentTarget.value })}
                rows={4}
              />
            </label>
            <label>
              <span>Kind</span>
              <select
                value={selectedNode.kind}
                onChange={(event) => updateNode(selectedNode.id, { kind: event.currentTarget.value as WorkflowType["nodes"][number]["kind"] })}
              >
                <option value="input">Input</option>
                <option value="research">Research</option>
                <option value="review">Review</option>
                <option value="decision">Decision</option>
                <option value="human">Human</option>
              </select>
            </label>
            <div className="builder-actions">
              <button type="button" className="ghost-button" onClick={() => setConnectionSourceId(connectionSourceId ? null : selectedNode.id)}>
                <GitBranch size={15} />
                {connectionSourceId ? "Cancel join" : "Start join"}
              </button>
              <button type="button" className="danger-button" onClick={() => deleteNode(selectedNode.id)}>
                <Trash2 size={15} />
                Delete seat
              </button>
            </div>
          </div>
        ) : (
          <div className="builder-empty-state">
            <Bot size={18} />
            <strong>Drop an agent</strong>
            <small>Drag from the library, then select a seat to edit it.</small>
          </div>
        )}
        <div className="builder-edge-list">
          <h3>Joins</h3>
          {workflow.edges.length === 0 ? (
            <p>No joins yet.</p>
          ) : (
            workflow.edges.map(([from, to]) => {
              const fromNode = workflow.nodes.find((node) => node.id === from);
              const toNode = workflow.nodes.find((node) => node.id === to);
              return (
                <div key={`${from}-${to}`}>
                  <span>{fromNode?.label ?? from} -&gt; {toNode?.label ?? to}</span>
                  <button type="button" aria-label={`Delete join ${from} to ${to}`} onClick={() => deleteEdge(from, to)}>
                    <X size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function RunProgressPanel({ progress }: { progress: RunProgress }) {
  return (
    <div className="run-progress-panel" role="status" aria-live="polite">
      <span className="status-dot review" />
      <div>
        <strong>{progress.label}</strong>
        <small>{progress.detail}</small>
      </div>
    </div>
  );
}

function ExecutionLogPanel({ entries, isRunning }: { entries: RunLogEntry[]; isRunning: boolean }) {
  if (entries.length === 0) return null;
  const slowest = entries
    .filter((entry) => entry.elapsedMs !== null)
    .sort((a, b) => (b.elapsedMs ?? 0) - (a.elapsedMs ?? 0))[0];

  return (
    <section className="execution-log-panel" aria-label="Workflow execution log">
      <div className="execution-log-head">
        <div>
          <h2>Execution log</h2>
          <p>{isRunning ? "Live status from the current run" : "Last run status"}</p>
        </div>
        {slowest && (
          <span>
            Slowest: {slowest.label.replace(" complete", "")} · {formatDurationMs(slowest.elapsedMs ?? 0)}
          </span>
        )}
      </div>
      <ol>
        {entries.slice(-8).map((entry) => (
          <li key={entry.id} className={entry.status}>
            <span className={cx("status-dot", entry.status === "completed" ? "ok" : entry.status === "failed" ? "danger" : "review")} />
            <div>
              <strong>{entry.label}</strong>
              <small>{entry.detail}</small>
            </div>
            {entry.elapsedMs !== null && <em>{formatDurationMs(entry.elapsedMs)}</em>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function SeatAssignmentPanel({
  assignments,
  providerReadiness,
  codexBridgeStatus,
  claudeBridgeStatus,
  onChange
}: {
  assignments: SeatAssignmentMap;
  providerReadiness: ProviderReadiness;
  codexBridgeStatus: CodexBridgeStatus;
  claudeBridgeStatus: ClaudeBridgeStatus;
  onChange: (seatId: CouncilSeatId, runner: SeatRunner) => void;
}) {
  const seatIds = Object.keys(councilSeatLabels) as CouncilSeatId[];
  return (
    <section className="seat-assignment-panel" aria-label="Council seat assignments">
      <div className="seat-assignment-head">
        <div>
          <h2>Council seats</h2>
          <p>Assign who should handle each role before execution.</p>
        </div>
        <span>CLI-ready roster</span>
      </div>
      <div className="seat-assignment-grid">
        {seatIds.map((seatId) => {
          const runner = assignments[seatId];
          const status = seatRunnerStatus(runner, providerReadiness, codexBridgeStatus, claudeBridgeStatus);
          return (
            <label key={seatId} className="seat-assignment-row">
              <span className="seat-assignment-title">
                <strong>{councilSeatLabels[seatId].label}</strong>
                <small>{councilSeatLabels[seatId].role}</small>
              </span>
              <select
                value={runner}
                onChange={(event) => onChange(seatId, event.currentTarget.value as SeatRunner)}
                aria-label={`${councilSeatLabels[seatId].label} runner`}
              >
                {seatRunnerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={cx("seat-runner-status", status.tone)}>
                <span className={cx("status-dot", status.tone)} />
                {status.label}
              </span>
            </label>
          );
        })}
      </div>
      <p className="seat-assignment-note">
        Codex and Claude seats run through local CLI bridges when those commands are available.
      </p>
    </section>
  );
}

function WorkflowRunnerPanel({
  workflow,
  agents,
  providerConfig,
  providerReadiness,
  codexBridgeStatus,
  claudeBridgeStatus,
  backendMode
}: {
  workflow: WorkflowType;
  agents: AgentProfile[];
  providerConfig: ProviderConfig;
  providerReadiness: ProviderReadiness;
  codexBridgeStatus: CodexBridgeStatus;
  claudeBridgeStatus: ClaudeBridgeStatus;
  backendMode: BackendMode;
}) {
  return (
    <section className="seat-assignment-panel custom-runner-panel" aria-label="Custom workflow seat assignments">
      <div className="seat-assignment-head">
        <div>
          <h2>Workflow seats</h2>
          <p>Each canvas seat resolves to a real runner before live execution.</p>
        </div>
        <span>{workflow.nodes.length} seats</span>
      </div>
      <div className="seat-assignment-grid">
        {workflow.nodes.length === 0 ? (
          <div className="seat-assignment-row">
            <span className="seat-assignment-title">
              <strong>No seats yet</strong>
              <small>Drop agents onto the canvas to build this workflow.</small>
            </span>
          </div>
        ) : (
          workflow.nodes.map((node) => {
            const agent = node.agentId ? agents.find((candidate) => candidate.id === node.agentId) : null;
            const runner = inferredRunnerForWorkflowNode(node, agents, providerConfig);
            const status = workflowSeatRunnerStatus(
              runner,
              providerReadiness,
              codexBridgeStatus,
              claudeBridgeStatus,
              backendMode
            );
            return (
              <div key={node.id} className="seat-assignment-row">
                <span className="seat-assignment-title">
                  <strong>{node.label}</strong>
                  <small>{node.role || node.kind}</small>
                </span>
                <span>{agent?.name ?? (node.kind === "input" || node.kind === "human" ? "System" : "Unassigned")}</span>
                <span className={cx("seat-runner-status", status.tone)}>
                  <span className={cx("status-dot", status.tone)} />
                  {status.label} · {runnerDisplayName(runner, providerConfig)}
                </span>
              </div>
            );
          })
        )}
      </div>
      <p className="seat-assignment-note">
        Use the canvas inspector to change a seat's agent, role, function, or kind.
      </p>
    </section>
  );
}

function FlowReport({
  run,
  onOpenRunArtifactFolder
}: {
  run: ExampleFlowRun;
  onOpenRunArtifactFolder?: (run: ExampleFlowRun) => void;
}) {
  return (
    <section id="latest-flow-report" className="flow-report" aria-label="Latest multi-agent flow report">
      <ReportDetail run={run} compact onOpenRunArtifactFolder={onOpenRunArtifactFolder} />
    </section>
  );
}

function ReportDetail({
  run,
  compact = false,
  onOpenRunArtifactFolder
}: {
  run: ExampleFlowRun;
  compact?: boolean;
  onOpenRunArtifactFolder?: (run: ExampleFlowRun) => void;
}) {
  const durationSeconds = Math.max(1, Math.round((run.finishedMs - run.startedMs) / 1000));

  return (
    <div className={cx("report-detail", compact && "is-compact")}>
      <div className="report-detail-head">
        <div>
          <p className="section-kicker">{run.mode === "Mock" ? "Fast demo simulation" : "Live multi-agent run"}</p>
          <h2>{run.workflowName}</h2>
          <div className="report-meta">
            <span>{run.projectName}</span>
            <span>{durationSeconds}s</span>
            <span>{run.confidence}% confidence</span>
          </div>
        </div>
        <div className="report-actions">
          <StatusPill tone={run.verdict === "APPROVE" ? "ok" : run.verdict === "ESCALATE" ? "danger" : "warn"}>
            Verdict: {run.verdict}
          </StatusPill>
          <button type="button" className="icon-button" aria-label="Copy report" title="Copy report" onClick={() => void copyRunReport(run).catch(() => undefined)}>
            <Copy size={15} />
          </button>
          <button type="button" className="icon-button" aria-label="Download report" title="Download report" onClick={() => downloadRunReport(run)}>
            <Download size={15} />
          </button>
          {onOpenRunArtifactFolder && (
            <button
              type="button"
              className="icon-button"
              aria-label="Open artifact folder"
              title="Open artifact folder"
              onClick={() => onOpenRunArtifactFolder(run)}
            >
              <FolderOpen size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="flow-question">
        <span>Council question</span>
        <p>{run.prompt}</p>
      </div>
      <div className="flow-answer">
        <span>Council answer</span>
        <p>{run.answer}</p>
      </div>
      <div className="flow-guardrail">
        <span>Project guardrail</span>
        <p>{run.guardrail}</p>
      </div>
      <p className="flow-summary">{run.summary}</p>
      <RunDiagnostics run={run} />
      <RunProofPanel run={run} />
      <div className="report-section-grid">
        <ReportList title="Assumptions" items={run.assumptions} />
        <ReportList title="Inputs and evidence" items={run.sources} />
        <ReportList title="Caveats" items={run.caveats} />
      </div>
      <div className="seat-report-list">
        {run.seats.map((seat) => (
          <article key={seat.seatId} className="seat-report-card">
            <div className="seat-report-head">
              <span className={cx("status-dot", seat.status === "done" ? "ok" : seat.status === "active" ? "review" : "idle")} />
              <div>
                <strong>{seat.label}</strong>
                <small>{seat.agent} · {seat.role}</small>
              </div>
              <span>{seatDurationLabel(seat)}</span>
            </div>
            <p>{normalizeReportSnippet(seat.summary)}</p>
            <div className="seat-report-evidence">
              {(seat.evidence.length > 0 ? seat.evidence : ["No evidence recorded."]).map((item) => (
                <span key={item}>{compactSnippet(item, 180)}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RunProofPanel({ run }: { run: ExampleFlowRun }) {
  const timings = seatTimingEntries(run);
  const runnerReceipts = run.seats
    .map((seat) => evidenceValue(seat.evidence, "Runner:") ?? seat.agent)
    .filter(Boolean);
  const uniqueReceipts = uniqueValues(runnerReceipts);
  return (
    <section className="run-proof-panel" aria-label="Run proof">
      <div>
        <span>Execution proof</span>
        <strong>{run.mode === "Live" ? "Live runner receipts" : "Demo simulation"}</strong>
        <small>{uniqueReceipts.length > 0 ? uniqueReceipts.join(" · ") : "No runner receipts recorded"}</small>
      </div>
      <div>
        <span>Timing receipts</span>
        <strong>{timings.length} / {run.seats.length}</strong>
        <small>{timings.length > 0 ? "Seat timings captured from evidence" : "Run live to capture timings"}</small>
      </div>
      <div>
        <span>Artifacts</span>
        <strong>{run.mode === "Live" ? "Local report writer" : "Preview only"}</strong>
        <small>{run.mode === "Live" ? "report_manifest.json, report.md, report.html, run.json" : "Native runs save local report artifacts"}</small>
      </div>
    </section>
  );
}

function RunDiagnostics({ run }: { run: ExampleFlowRun }) {
  const totalDurationMs = Math.max(0, run.finishedMs - run.startedMs);
  const timings = seatTimingEntries(run);
  const slowest = timings.sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
  const runnerMix = Array.from(new Set(run.seats.map((seat) => seat.agent))).join(", ");

  return (
    <section className="run-diagnostics" aria-label="Run diagnostics">
      <div>
        <span>Total</span>
        <strong>{formatDurationMs(totalDurationMs)}</strong>
        <small>{run.mode === "Live" ? "measured wall time" : "demo duration"}</small>
      </div>
      <div>
        <span>Slowest seat</span>
        <strong>{slowest ? slowest.seat.label : "Not captured"}</strong>
        <small>{slowest ? `${slowest.seat.agent} · ${formatDurationMs(slowest.durationMs)}` : "Run live to capture CLI timings"}</small>
      </div>
      <div>
        <span>Seat timings</span>
        <strong>{timings.length}</strong>
        <small>{timings.length > 0 ? "reported by agents" : "none in this report"}</small>
      </div>
      <div>
        <span>Runners</span>
        <strong>{run.seats.length}</strong>
        <small>{runnerMix}</small>
      </div>
    </section>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-list">
      <h3>{title}</h3>
      <ul>
        {(items.length > 0 ? items : ["No entries recorded for this run."]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function WorkflowCanvas({
  workflow,
  progress,
  hasCompletedRun,
  selectedNodeId,
  onNodeClick,
  onConnectNodes,
  onMoveNode,
  onCanvasDrop,
  onCanvasDragOver,
  onCanvasMouseUp
}: {
  workflow: WorkflowType;
  progress: RunProgress | null;
  hasCompletedRun: boolean;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onConnectNodes?: (from: string, to: string) => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onCanvasDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasMouseUp?: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const canvasWidth = 740;
  const canvasHeight = 300;
  const nodeWidth = 112;
  const nodeHeight = 58;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canvasSize, setCanvasSize] = useState({ width: canvasWidth, height: canvasHeight });
  const [measuredEdgePaths, setMeasuredEdgePaths] = useState<Record<string, string>>({});
  const [draftConnection, setDraftConnection] = useState<{
    sourceId: string;
    targetId: string | null;
    x: number;
    y: number;
  } | null>(null);
  const [nodeDrag, setNodeDrag] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const draftConnectionRef = useRef(draftConnection);
  const nodeDragRef = useRef(nodeDrag);
  const moveNodeRef = useRef(onMoveNode);
  const byId = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]));
  const completed = new Set(progress?.completedNodeIds ?? (hasCompletedRun ? workflow.nodes.map((node) => node.id) : []));
  const activeNodeId = progress?.activeNodeId ?? null;

  useEffect(() => {
    draftConnectionRef.current = draftConnection;
  }, [draftConnection]);

  useEffect(() => {
    nodeDragRef.current = nodeDrag;
  }, [nodeDrag]);

  useEffect(() => {
    moveNodeRef.current = onMoveNode;
  }, [onMoveNode]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const edgeKey = (from: string, to: string) => `${from}-${to}`;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const canvasRect = canvas.getBoundingClientRect();
        const nextPaths: Record<string, string> = {};

        workflow.edges.forEach(([from, to]) => {
          const fromEl = nodeRefs.current[from];
          const toEl = nodeRefs.current[to];
          if (!fromEl || !toEl) return;

          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const startX = fromRect.right - canvasRect.left;
          const startY = fromRect.top - canvasRect.top + fromRect.height / 2;
          const endX = toRect.left - canvasRect.left;
          const endY = toRect.top - canvasRect.top + toRect.height / 2;
          const gap = endX - startX;
          const midX = gap > 0 ? startX + Math.max(24, gap / 2) : startX + 24;

          nextPaths[edgeKey(from, to)] = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
        });

        setCanvasSize({ width: Math.max(1, canvasRect.width), height: Math.max(1, canvasRect.height) });
        setMeasuredEdgePaths((current) => {
          const currentKeys = Object.keys(current);
          const nextKeys = Object.keys(nextPaths);
          const changed =
            currentKeys.length !== nextKeys.length ||
            nextKeys.some((key) => current[key] !== nextPaths[key]);
          return changed ? nextPaths : current;
        });
      });
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(canvas);
    workflow.nodes.forEach((node) => {
      const nodeEl = nodeRefs.current[node.id];
      if (nodeEl) observer.observe(nodeEl);
    });
    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [workflow]);

  useEffect(() => {
    if (!draftConnection) return;

    const updateDraft = (event: PointerEvent) => {
      const point = canvasPoint(event.clientX, event.clientY);
      if (!point) return;
      setDraftConnection((current) =>
        current
          ? {
              ...current,
              ...point,
              targetId: nodeAtPoint(event.clientX, event.clientY, current.sourceId)
            }
          : current
      );
    };

    const finishDraft = (event: PointerEvent) => {
      const current = draftConnectionRef.current;
      if (!current) return;

      const targetId = nodeAtPoint(event.clientX, event.clientY, current.sourceId);
      if (targetId) {
        onConnectNodes?.(current.sourceId, targetId);
      }
      setDraftConnection(null);
    };

    window.addEventListener("pointermove", updateDraft);
    window.addEventListener("pointerup", finishDraft);
    window.addEventListener("pointercancel", finishDraft);

    return () => {
      window.removeEventListener("pointermove", updateDraft);
      window.removeEventListener("pointerup", finishDraft);
      window.removeEventListener("pointercancel", finishDraft);
    };
  }, [Boolean(draftConnection), onConnectNodes]);

  useEffect(() => {
    if (!nodeDrag) return;

    const updateNodeDrag = (event: PointerEvent) => {
      const current = nodeDragRef.current;
      if (!current) return;
      const point = canvasLogicalPoint(event.clientX, event.clientY);
      if (!point) return;

      const nextX = Math.max(18, Math.min(canvasWidth - nodeWidth, point.x - current.offsetX));
      const nextY = Math.max(18, Math.min(canvasHeight - nodeHeight, point.y - current.offsetY));
      moveNodeRef.current?.(current.nodeId, nextX, nextY);
    };

    const finishNodeDrag = () => {
      setNodeDrag(null);
    };

    window.addEventListener("pointermove", updateNodeDrag);
    window.addEventListener("pointerup", finishNodeDrag);
    window.addEventListener("pointercancel", finishNodeDrag);

    return () => {
      window.removeEventListener("pointermove", updateNodeDrag);
      window.removeEventListener("pointerup", finishNodeDrag);
      window.removeEventListener("pointercancel", finishNodeDrag);
    };
  }, [Boolean(nodeDrag)]);

  function canvasPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top))
    };
  }

  function canvasLogicalPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvasWidth, ((clientX - rect.left) / rect.width) * canvasWidth)),
      y: Math.max(0, Math.min(canvasHeight, ((clientY - rect.top) / rect.height) * canvasHeight))
    };
  }

  function nodeAtPoint(clientX: number, clientY: number, sourceId: string) {
    return (
      workflow.nodes.find((node) => {
        if (node.id === sourceId) return false;
        const nodeEl = nodeRefs.current[node.id];
        if (!nodeEl) return false;
        const rect = nodeEl.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      })?.id ?? null
    );
  }

  function edgePath(from: string, to: string) {
    const a = byId[from];
    const b = byId[to];
    const startX = a.x + nodeWidth;
    const startY = a.y + nodeHeight / 2;
    const endX = b.x;
    const endY = b.y + nodeHeight / 2;
    const midX = startX + Math.max(34, (endX - startX) / 2);
    return `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
  }

  function draftConnectionPath() {
    if (!draftConnection) return "";
    const fromEl = nodeRefs.current[draftConnection.sourceId];
    const canvas = canvasRef.current;
    const fallback = byId[draftConnection.sourceId];
    let startX = fallback ? (fallback.x / canvasWidth) * canvasSize.width + nodeWidth : 0;
    let startY = fallback ? (fallback.y / canvasHeight) * canvasSize.height + nodeHeight / 2 : 0;

    if (fromEl && canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      const fromRect = fromEl.getBoundingClientRect();
      startX = fromRect.right - canvasRect.left;
      startY = fromRect.top - canvasRect.top + fromRect.height / 2;
    }

    const bend = Math.max(34, Math.abs(draftConnection.x - startX) / 2);
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${draftConnection.x - bend} ${draftConnection.y}, ${draftConnection.x} ${draftConnection.y}`;
  }

  function startConnectionDrag(event: React.PointerEvent<HTMLElement>, sourceId: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    setDraftConnection({
      sourceId,
      targetId: null,
      ...point
    });
  }

  function startNodeDrag(event: React.PointerEvent<HTMLButtonElement>, node: WorkflowType["nodes"][number]) {
    if (!onMoveNode || event.button !== 0) return;
    const point = canvasLogicalPoint(event.clientX, event.clientY);
    if (!point) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    onNodeClick?.(node.id);
    setNodeDrag({
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y
    });
  }

  function edgeState(from: string, to: string) {
    if (completed.has(from) && completed.has(to)) return "is-complete";
    if (completed.has(from) && activeNodeId === to) return "is-active";
    return "";
  }

  function nodeState(id: string) {
    return cx(
      activeNodeId === id && "is-active",
      completed.has(id) && "is-complete",
      selectedNodeId === id && "is-selected",
      draftConnection?.sourceId === id && "is-connection-source",
      draftConnection?.targetId === id && "is-connection-target",
      nodeDrag?.nodeId === id && "is-dragging"
    );
  }

  return (
    <div
      className={cx(
        "canvas",
        onCanvasDrop && "is-editable",
        draftConnection && "is-connecting",
        nodeDrag && "is-node-dragging"
      )}
      ref={canvasRef}
      onDrop={onCanvasDrop}
      onDragOver={onCanvasDragOver}
      onMouseUp={onCanvasMouseUp}
    >
      <svg className="canvas-lines" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none" aria-hidden="true">
        {workflow.edges.map(([from, to]) => {
          const key = `${from}-${to}`;
          return (
            <path
              key={key}
              data-edge-id={key}
              className={edgeState(from, to)}
              d={measuredEdgePaths[key] ?? edgePath(from, to)}
            />
          );
        })}
        {draftConnection && (
          <path
            className="is-draft"
            d={draftConnectionPath()}
          />
        )}
      </svg>
      {workflow.nodes.map((node) => (
        <button
          key={node.id}
          data-node-id={node.id}
          ref={(element) => {
            nodeRefs.current[node.id] = element;
          }}
          type="button"
          onClick={() => onNodeClick?.(node.id)}
          onPointerDown={(event) => startNodeDrag(event, node)}
          className={cx("workflow-node", node.kind, onConnectNodes && "has-connectors", nodeState(node.id))}
          style={{ left: `${(node.x / canvasWidth) * 100}%`, top: `${(node.y / canvasHeight) * 100}%` }}
        >
          {onConnectNodes && <span className="node-input-handle" aria-hidden="true" />}
          <span className="node-dot" />
          <strong>{node.label}</strong>
          <small>{node.kind}</small>
          {onConnectNodes && (
            <span
              className="node-output-handle"
              title={`Connect from ${node.label}`}
              aria-label={`Connect from ${node.label}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => startConnectionDrag(event, node.id)}
            />
          )}
        </button>
      ))}
    </div>
  );
}

function RunsPage({
  selectedProject,
  flowRuns,
  selectedRunId,
  onSelectRun,
  onOpenRunArtifactFolder
}: {
  selectedProject: Project;
  flowRuns: ExampleFlowRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenRunArtifactFolder: (run: ExampleFlowRun) => void;
}) {
  const selectedFlowRun = flowRuns.find((run) => run.id === selectedRunId) ?? flowRuns[0] ?? null;
  const liveCount = flowRuns.filter((run) => run.mode === "Live").length;
  const revisionCount = flowRuns.filter((run) => run.verdict === "REVISE").length;

  return (
    <section className="content-panel">
      <PanelHeader title="Run history" action="Export" />
      <RunHistorySummary
        selectedProject={selectedProject}
        selectedRun={selectedFlowRun}
        savedCount={flowRuns.length}
        liveCount={liveCount}
        revisionCount={revisionCount}
      />
      <div className="runs-table">
        {flowRuns.map((run, index) => (
          <button
            key={run.id}
            type="button"
            className={cx("run-row", selectedFlowRun?.id === run.id && "is-selected")}
            onClick={() => onSelectRun(run.id)}
          >
            <span className="run-id">{run.id}</span>
            <span>
              <strong>{run.workflowName}</strong>
              <small>{run.projectName}</small>
            </span>
            <StatusPill tone={run.mode === "Live" ? "review" : "idle"}>{run.mode}</StatusPill>
            <StatusPill tone={run.verdict === "APPROVE" ? "ok" : run.verdict === "ESCALATE" ? "danger" : "warn"}>
              {run.verdict}
            </StatusPill>
            <span className="muted">{Math.max(1, Math.round((run.finishedMs - run.startedMs) / 1000))}s</span>
            <span className="muted">$0.00</span>
            <span className="muted">{index === 0 ? "latest" : "saved"}</span>
          </button>
        ))}
        {runs.map((run) => (
          <div key={run.id} className="run-row">
            <span className="run-id">{run.id}</span>
            <span>
              <strong>{run.workflow}</strong>
              <small>{run.project}</small>
            </span>
            <StatusPill tone={run.mode === "Live" ? "review" : "idle"}>{run.mode}</StatusPill>
            <StatusPill tone={run.outcome === "Failed" ? "danger" : run.outcome === "Needs revision" ? "warn" : "ok"}>
              {run.outcome}
            </StatusPill>
            <span className="muted">{run.duration}</span>
            <span className="muted">{run.cost}</span>
            <span className="muted">{run.time}</span>
          </div>
        ))}
      </div>
      {selectedFlowRun ? (
        <section className="report-preview" aria-label="Selected run report">
          <ReportDetail run={selectedFlowRun} onOpenRunArtifactFolder={onOpenRunArtifactFolder} />
        </section>
      ) : (
        <div className="report-preview">
          <h2>Latest report preview</h2>
          <p>
            {selectedProject.name} needs a starter agent file before the workflow can fully trust project-specific instructions. Recommended next action: create an AGENTS.md preview, review it, then run Project Review Council live.
          </p>
        </div>
      )}
    </section>
  );
}

function RunHistorySummary({
  selectedProject,
  selectedRun,
  savedCount,
  liveCount,
  revisionCount
}: {
  selectedProject: Project;
  selectedRun: ExampleFlowRun | null;
  savedCount: number;
  liveCount: number;
  revisionCount: number;
}) {
  const timings = selectedRun ? seatTimingEntries(selectedRun) : [];
  const slowest = timings.sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
  const selectedDuration = selectedRun ? Math.max(0, selectedRun.finishedMs - selectedRun.startedMs) : 0;

  return (
    <section className="run-history-summary" aria-label="Run history summary">
      <div>
        <span>Saved reports</span>
        <strong>{savedCount}</strong>
        <small>{savedCount === 0 ? "Run a workflow to start history" : `${liveCount} live · ${revisionCount} revise`}</small>
      </div>
      <div>
        <span>Selected run</span>
        <strong>{selectedRun ? selectedRun.verdict : "No report"}</strong>
        <small>{selectedRun ? `${selectedRun.workflowName} · ${formatDurationMs(selectedDuration)}` : selectedProject.name}</small>
      </div>
      <div>
        <span>Slowest seat</span>
        <strong>{slowest ? slowest.seat.label : "Not captured"}</strong>
        <small>{slowest ? `${formatDurationMs(slowest.durationMs)} · ${slowest.seat.agent}` : "Live CLI timings appear here"}</small>
      </div>
      <div>
        <span>Next review</span>
        <strong>{selectedProject.risk === "Clear" ? "Ready" : "Guardrail"}</strong>
        <small>{selectedProject.risk === "Clear" ? selectedProject.nextTask : selectedProject.risk}</small>
      </div>
    </section>
  );
}

const agentDefaultPolicyRows = [
  {
    agent: "Summariser, Editor",
    defaultModel: "Apple FM",
    modelTone: "local",
    why: "Light rewrite, condensation, cleanup"
  },
  {
    agent: "Researcher (no web), Drift Auditor, Router/Dispatcher",
    defaultModel: "Apple FM",
    modelTone: "local",
    why: "Gather, structure, classify, short judgement"
  },
  {
    agent: "Critic, Devil's Advocate, Risk Assessor",
    defaultModel: "Claude Sonnet",
    modelTone: "cloud",
    why: "Deeper reasoning, adversarial review, risk tradeoffs"
  },
  {
    agent: "Fact-Checker, web-search Researchers",
    defaultModel: "Cloud",
    modelTone: "cloud",
    why: "Needs current facts, source checking, web context"
  },
  {
    agent: "Chair, Judge",
    defaultModel: "Claude Sonnet",
    modelTone: "cloud",
    why: "Synthesis, adjudication, final recommendation"
  },
  {
    agent: "Forecast Analyst, Research Writer, Problem Solver, HTML Report Producer",
    defaultModel: "Claude Sonnet",
    modelTone: "cloud",
    why: "Heavy deliverables, long-form reasoning, report production"
  }
] as const;

function AgentDefaultPolicyPanel() {
  return (
    <section className="agent-default-policy" aria-label="Agent default model policy">
      <div className="agent-default-policy-title">
        <strong>Default model policy</strong>
        <small>Apple FM handles private lightweight local seats; Claude Sonnet handles deeper cloud reasoning.</small>
      </div>
      <div className="agent-default-table" role="table" aria-label="Agent model defaults">
        <div className="agent-default-row agent-default-header" role="row">
          <span role="columnheader">Agent</span>
          <span role="columnheader">Default</span>
          <span role="columnheader">Why</span>
        </div>
        {agentDefaultPolicyRows.map((row) => (
          <div className="agent-default-row" role="row" key={row.agent}>
            <span role="cell">{row.agent}</span>
            <span role="cell">
              <span className={cx("agent-default-badge", row.modelTone)}>{row.defaultModel}</span>
            </span>
            <span role="cell">{row.why}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentLibrary({
  agents,
  customAgentIds,
  localModels,
  onCreateAgent,
  onUpdateAgent,
  onDeleteAgent
}: {
  agents: AgentProfile[];
  customAgentIds: Set<string>;
  localModels: string[];
  onCreateAgent: (draft: AgentDraft) => void;
  onUpdateAgent: (agent: AgentProfile) => void;
  onDeleteAgent: (agentId: string) => void;
}) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const editingAgent = editingAgentId ? agents.find((agent) => agent.id === editingAgentId) ?? null : null;
  const isFormOpen = isComposerOpen || Boolean(editingAgent);

  return (
    <section className="content-panel">
      <PanelHeader
        title="Agent library"
        action={isFormOpen ? "Close" : "Create agent"}
        onAction={() => {
          if (isFormOpen) {
            setEditingAgentId(null);
            setIsComposerOpen(false);
          } else {
            setIsComposerOpen(true);
          }
        }}
      />
      <AgentDefaultPolicyPanel />
      {isFormOpen && (
        <AgentComposer
          key={editingAgent?.id ?? "new-agent"}
          localModels={localModels}
          initialAgent={editingAgent ?? undefined}
          submitLabel={editingAgent ? "Save agent" : "Create agent"}
          onCancel={() => {
            setEditingAgentId(null);
            setIsComposerOpen(false);
          }}
          onSubmit={(draft) => {
            if (editingAgent) {
              onUpdateAgent(updateAgentFromDraft(editingAgent, draft));
            } else {
              onCreateAgent(draft);
            }
            setEditingAgentId(null);
            setIsComposerOpen(false);
          }}
        />
      )}
      <div className="agent-grid">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            canEdit
            canDelete={customAgentIds.has(agent.id)}
            onEdit={(agentId) => {
              setIsComposerOpen(false);
              setEditingAgentId(agentId);
            }}
            onDelete={onDeleteAgent}
          />
        ))}
      </div>
    </section>
  );
}

function AgentComposer({
  localModels,
  initialAgent,
  submitLabel = "Create agent",
  onSubmit,
  onCancel
}: {
  localModels: string[];
  initialAgent?: AgentProfile;
  submitLabel?: string;
  onSubmit: (draft: AgentDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AgentDraft>(() => initialAgent ? createAgentDraftFromProfile(initialAgent) : defaultAgentDraft());
  const modelOptions = uniqueValues([
    "Codex",
    "Claude",
    appleFoundationModelsAgentModel,
    ...localModels.map(agentModelOptionForLocalModel)
  ]);
  const selectedAppleFoundationModel = /apple foundation|foundation models/i.test(draft.model);
  const canCreate = draft.name.trim().length > 2;

  useEffect(() => {
    setDraft(initialAgent ? createAgentDraftFromProfile(initialAgent) : defaultAgentDraft());
  }, [initialAgent?.id]);

  return (
    <form
      className="agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) onSubmit(draft);
      }}
    >
      <div className="agent-composer-grid">
        <label>
          <span>Name</span>
          <input
            value={draft.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setDraft((current) => ({ ...current, name }));
            }}
            placeholder="Agent name"
          />
        </label>
        <label>
          <span>Authority</span>
          <select
            value={draft.authority}
            onChange={(event) => {
              const authority = event.currentTarget.value as AgentProfile["authority"];
              setDraft((current) => ({ ...current, authority }));
            }}
          >
            <option value="Recommend">Recommend</option>
            <option value="Decide">Decide</option>
            <option value="Approve">Approve</option>
            <option value="Act">Act</option>
          </select>
        </label>
        <label>
          <span>Model or runner</span>
          <input
            list="agent-model-options"
            value={draft.model}
            onChange={(event) => {
              const model = event.currentTarget.value;
              setDraft((current) => ({
                ...current,
                model,
                localFit: /local|ollama|gemma|apple foundation|foundation models/i.test(model) ? "high" : current.localFit
              }));
            }}
            placeholder="Codex, Claude, local model..."
          />
          <datalist id="agent-model-options">
            {modelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
        {selectedAppleFoundationModel && (
          <p className="settings-note agent-guidance-note">{appleFoundationModelsGuidance}</p>
        )}
        <label>
          <span>Default tools</span>
          <input
            value={draft.tools}
            onChange={(event) => {
              const tools = event.currentTarget.value;
              setDraft((current) => ({ ...current, tools }));
            }}
            placeholder="Files, Web Search, Terminal read-only"
          />
        </label>
        <label className="agent-role-field">
          <span>Role and function</span>
          <textarea
            value={draft.role}
            onChange={(event) => {
              const role = event.currentTarget.value;
              setDraft((current) => ({ ...current, role }));
            }}
            placeholder="What should this agent do in a workflow?"
            rows={3}
          />
        </label>
        <label className="agent-role-field">
          <span>Instructions</span>
          <textarea
            value={draft.instructions}
            onChange={(event) => {
              const instructions = event.currentTarget.value;
              setDraft((current) => ({ ...current, instructions }));
            }}
            placeholder="Specific operating instructions for this agent"
            rows={3}
          />
        </label>
        <label>
          <span>Skill ref</span>
          <input
            value={draft.skillRef}
            onChange={(event) => {
              const skillRef = event.currentTarget.value;
              setDraft((current) => ({ ...current, skillRef }));
            }}
            placeholder="Optional local skill name"
          />
        </label>
        <label>
          <span>Prompt ref</span>
          <input
            value={draft.promptRef}
            onChange={(event) => {
              const promptRef = event.currentTarget.value;
              setDraft((current) => ({ ...current, promptRef }));
            }}
            placeholder="Optional prompt-library reference"
          />
        </label>
        <label>
          <span>Output format</span>
          <select
            value={draft.outputFormat}
            onChange={(event) => {
              const outputFormat = event.currentTarget.value as AgentDraft["outputFormat"];
              setDraft((current) => ({ ...current, outputFormat }));
            }}
          >
            <option value="summary">Summary</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
        </label>
        <label>
          <span>Local fit</span>
          <select
            value={draft.localFit}
            onChange={(event) => {
              const localFit = event.currentTarget.value as AgentDraft["localFit"];
              setDraft((current) => ({ ...current, localFit }));
            }}
          >
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="agent-checkbox">
          <input
            type="checkbox"
            checked={draft.webSearch}
            onChange={(event) => {
              const webSearch = event.currentTarget.checked;
              setDraft((current) => ({ ...current, webSearch }));
            }}
          />
          <span>May need web research</span>
        </label>
      </div>
      <div className="workflow-composer-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={!canCreate}>
          <Plus size={15} />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function agentModelOptionForLocalModel(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "system" || normalized === "pcc") return `Apple Foundation Models: ${trimmed}`;
  return `Ollama: ${trimmed}`;
}

function AgentCard({
  agent,
  canEdit,
  canDelete,
  onEdit,
  onDelete
}: {
  agent: AgentProfile;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (agentId: string) => void;
  onDelete: (agentId: string) => void;
}) {
  return (
    <article className="agent-card">
      <div className="agent-card-head">
        <span>
          <Bot size={18} />
        </span>
        <div className="agent-card-actions">
          <StatusPill tone={agent.authority === "Decide" ? "review" : agent.authority === "Approve" ? "ok" : "idle"}>
            {agent.authority}
          </StatusPill>
          {canEdit && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Edit ${agent.name}`}
              title={`Edit ${agent.name}`}
              onClick={() => onEdit(agent.id)}
            >
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="icon-danger-button"
              aria-label={`Delete ${agent.name}`}
              onClick={() => onDelete(agent.id)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <h2>{agent.name}</h2>
      <p>{agent.role}</p>
      <div className="agent-meta">
        <span>{agent.model}</span>
        <span>{agent.defaultTools.join(", ")}</span>
      </div>
      <div className="agent-flags">
        <span>{agent.outputFormat ?? "summary"}</span>
        <span>Local fit: {agent.localFit ?? "medium"}</span>
        {agent.webSearch && <span>Web research</span>}
        {agent.skillRef && <span>{agent.skillRef}</span>}
      </div>
    </article>
  );
}

function SettingsPage({
  appStatus,
  backendMode,
  providerConfig,
  externalApiKeyInput,
  providerEndpointStatus,
  providerReadiness,
  ollamaModels,
  onProviderConfigChange,
  onExternalApiKeyInputChange,
  onSaveProviderConfig,
  onClearProviderApiKey,
  onUseOllamaPreset,
  onUseApplePreset,
  onCheckProviderEndpoint,
  isCheckingProvider,
  isSavingProvider
}: {
  appStatus: AppStatus | null;
  backendMode: BackendMode;
  providerConfig: ProviderConfig;
  externalApiKeyInput: string;
  providerEndpointStatus: ProviderEndpointStatus | null;
  providerReadiness: ProviderReadiness;
  ollamaModels: string[];
  onProviderConfigChange: (config: ProviderConfig) => void;
  onExternalApiKeyInputChange: (value: string) => void;
  onSaveProviderConfig: () => void | Promise<void>;
  onClearProviderApiKey: () => void | Promise<void>;
  onUseOllamaPreset: () => void;
  onUseApplePreset: () => void;
  onCheckProviderEndpoint: () => void | Promise<void>;
  isCheckingProvider: boolean;
  isSavingProvider: boolean;
}) {
  const dataStoreDetail =
    backendMode === "demo"
      ? "Browser preview is using demo data. Launch with Tauri to use the local SQLite store."
      : appStatus
        ? `${appStatus.backend} · ${appStatus.projectCount} projects · ${appStatus.dbPath}`
        : "SQLite backend is available, but status has not loaded yet.";
  const isAppleFoundationModels = isAppleFoundationModelsConfig(providerConfig);
  const externalProviderSupported = isSupportedExternalProvider(providerConfig.externalProvider);
  const localModelOptions = uniqueValues([appleFoundationModelsModel, ...ollamaModels]);
  const updateProvider = (patch: Partial<ProviderConfig>) => {
    onProviderConfigChange(normalizeProviderConfig({ ...providerConfig, ...patch }));
  };

  return (
    <section className="settings-grid">
      <div className="content-panel provider-settings-panel">
        <PanelHeader title="Model provider" />
        <div className={cx("provider-status-card", providerReadiness.tone)}>
          <span className={cx("status-dot", providerToneDot(providerReadiness.tone))} />
          <div>
            <strong>{providerReadiness.label}</strong>
            <small>{providerReadiness.detail}</small>
          </div>
        </div>

        <div className="provider-mode-grid" role="group" aria-label="Model provider mode">
          {[
            { mode: "demo" as const, icon: Sparkles, title: "Demo", detail: "Fast local simulation" },
            { mode: "local" as const, icon: Terminal, title: "Local endpoint", detail: "Ollama, LM Studio, Apple FM" },
            { mode: "external" as const, icon: Bot, title: "External API", detail: "OpenAI via Keychain" }
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                type="button"
                key={option.mode}
                className={cx("provider-mode-card", providerConfig.mode === option.mode && "is-selected")}
                onClick={() => updateProvider({ mode: option.mode })}
              >
                <span>
                  <Icon size={17} />
                </span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </button>
            );
          })}
        </div>

        {providerConfig.mode === "local" && (
          <>
            <div className="settings-fields">
              <label className="setting-field">
                <span>OpenAI-compatible base URL</span>
                <input
                  value={providerConfig.localBaseUrl}
                  onChange={(event) => updateProvider({ localBaseUrl: event.currentTarget.value })}
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </label>
              <label className="setting-field">
                <span>Model name</span>
                <input
                  list="local-model-options"
                  value={providerConfig.localModel}
                  onChange={(event) => updateProvider({ localModel: event.currentTarget.value })}
                  placeholder="gemma4:26b"
                />
                <datalist id="local-model-options">
                  {localModelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className={cx("provider-endpoint-card", providerEndpointStatus?.available && "is-available", providerEndpointStatus?.modelInstalled && "is-ready")}>
              <span className={cx("status-dot", providerEndpointStatus?.modelInstalled ? "ok" : providerEndpointStatus?.available ? "warn" : "review")} />
              <div>
                <strong>{providerEndpointStatus?.label ?? "Provider not checked"}</strong>
                <small>
                  {providerEndpointStatus?.detail ??
                    `Ready to check ${providerConfig.localModel || "the selected model"} at ${providerConfig.localBaseUrl || "the selected endpoint"}.`}
                </small>
                {ollamaModels.length ? (
                  <span>Available models: {ollamaModels.slice(0, 5).join(", ")}</span>
                ) : null}
              </div>
            </div>
            {isAppleFoundationModels && (
              <p className="settings-note provider-guidance-note">
                Start Apple Foundation Models with fm serve --host 127.0.0.1 --port 1976. {appleFoundationModelsGuidance}
              </p>
            )}
          </>
        )}

        {providerConfig.mode === "external" && (
          <>
            <div className="settings-fields">
              <label className="setting-field">
                <span>Provider</span>
                <select
                  value={providerConfig.externalProvider}
                  onChange={(event) => updateProvider({ externalProvider: event.currentTarget.value })}
                >
                  <option>OpenAI</option>
                  <option disabled>Anthropic</option>
                  <option disabled>OpenAI-compatible</option>
                </select>
              </label>
              <label className="setting-field">
                <span>Model</span>
                <input
                  value={providerConfig.externalModel}
                  onChange={(event) => updateProvider({ externalModel: event.currentTarget.value })}
                  placeholder="gpt-4.1-mini"
                />
              </label>
              <label className="setting-field external-key-field">
                <span>API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={externalApiKeyInput}
                  onChange={(event) => onExternalApiKeyInputChange(event.currentTarget.value)}
                  placeholder={providerConfig.apiKeyStored ? "Stored in macOS Keychain" : "Enter key, then save provider"}
                />
              </label>
              <p className="settings-note">
                Keys are stored in macOS Keychain and never written to SQLite. External runs send the prompt and selected local context to the provider.
              </p>
            </div>
            <div
              className={cx(
                "provider-endpoint-card",
                providerEndpointStatus?.available && "is-available",
                providerEndpointStatus?.modelInstalled && "is-ready",
                !externalProviderSupported && "is-blocked"
              )}
            >
              <span
                className={cx(
                  "status-dot",
                  providerEndpointStatus?.modelInstalled ? "ok" : externalProviderSupported ? "review" : "warn"
                )}
              />
              <div>
                <strong>{providerEndpointStatus?.label ?? "External provider not checked"}</strong>
                <small>
                  {providerEndpointStatus?.detail ??
                    (externalProviderSupported
                      ? `Ready to check ${providerConfig.externalModel || "the selected model"} with ${providerConfig.externalProvider}.`
                      : `${providerConfig.externalProvider} is not wired yet. OpenAI is supported in this build.`)}
                </small>
                {providerConfig.apiKeyStored ? <span>API key: stored in macOS Keychain</span> : <span>API key: not stored</span>}
              </div>
            </div>
          </>
        )}

        {providerReadiness.issues.length > 0 && (
          <ul className="settings-issues">
            {providerReadiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        <div className="settings-actions">
          {(providerConfig.mode === "local" || providerConfig.mode === "external") && (
            <div className="settings-action-group">
              {providerConfig.mode === "local" && (
                <>
                  <button type="button" onClick={onUseApplePreset}>
                    <Sparkles size={16} />
                    Use Apple Foundation Models
                  </button>
                  <button type="button" onClick={onUseOllamaPreset}>
                    <Terminal size={16} />
                    Use Ollama Gemma 4 26B
                  </button>
                </>
              )}
              {providerConfig.mode === "external" && providerConfig.apiKeyStored && (
                <button type="button" onClick={onClearProviderApiKey} disabled={isSavingProvider}>
                  <KeyRound size={16} />
                  Clear stored key
                </button>
              )}
              <button type="button" onClick={onCheckProviderEndpoint} disabled={isCheckingProvider}>
                <CircleDot size={16} />
                {isCheckingProvider ? "Checking..." : "Check provider"}
              </button>
            </div>
          )}
          <button type="button" className="primary-button" onClick={onSaveProviderConfig} disabled={isSavingProvider}>
            <Check size={16} />
            {isSavingProvider ? "Saving..." : "Save provider"}
          </button>
        </div>
      </div>
      <div className="content-panel">
        <PanelHeader title="Local sources" action="Add folder" />
        <SettingRow icon={HardDrive} title="Default scan roots" detail="~/code, ~/Sites, ~/Documents when present · excludes node_modules, target, dist" />
        <SettingRow icon={Archive} title="Agent history backfill" detail="Claude, Codex, Gemini, Grok · read minimal metadata only" />
        <SettingRow icon={ShieldCheck} title="Secrets policy" detail="Flag existence by filename only. Contents are never read." />
      </div>
      <div className="content-panel">
        <PanelHeader title="Run guardrails" action="Edit" />
        <SettingRow icon={MonitorPlay} title="Live workflow confirmation" detail="Show model, tools, project scope, and cost implication before start" />
        <SettingRow icon={Blocks} title="Agent file creation" detail="Preview file path and content before writing. Undo is offered after create." />
        <SettingRow icon={Database} title="Data store" detail={dataStoreDetail} />
      </div>
    </section>
  );
}

function SettingRow({ icon: Icon, title, detail }: { icon: typeof HardDrive; title: string; detail: string }) {
  return (
    <div className="setting-row">
      <span>
        <Icon size={17} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Toast({
  message,
  actionLabel,
  onAction,
  onClose
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="toast" role="status">
      <span>
        <Check size={16} />
      </span>
      <strong>{message}</strong>
      {actionLabel && (
        <button
          type="button"
          onClick={() => {
            onAction?.();
            onClose();
          }}
        >
          {actionLabel}
        </button>
      )}
      <button type="button" aria-label="Dismiss notification" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("command");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("All");
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [customWorkflows, setCustomWorkflows] = useState<WorkflowType[]>(() => loadStoredCustomWorkflows());
  const [customAgents, setCustomAgents] = useState<AgentProfile[]>(() => loadStoredCustomAgents());
  const [backendMode, setBackendMode] = useState<BackendMode>("demo");
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(defaultProviderConfig);
  const [externalApiKeyInput, setExternalApiKeyInput] = useState("");
  const [providerEndpointStatus, setProviderEndpointStatus] = useState<ProviderEndpointStatus | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignmentMap>(defaultSeatAssignments);
  const [codexBridgeStatus, setCodexBridgeStatus] = useState<CodexBridgeStatus>(defaultCodexBridgeStatus);
  const [claudeBridgeStatus, setClaudeBridgeStatus] = useState<ClaudeBridgeStatus>(defaultClaudeBridgeStatus);
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(seedProjects[0].id);
  const [selectedWorkflow, setSelectedWorkflow] = useState(workflows[0]);
  const [live, setLive] = useState(true);
  const [councilPrompt, setCouncilPrompt] = useState(defaultCouncilPrompt);
  const [isRunningFlow, setIsRunningFlow] = useState(false);
  const [isCancellingFlow, setIsCancellingFlow] = useState(false);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [runEventLog, setRunEventLog] = useState<RunLogEntry[]>([]);
  const [flowRuns, setFlowRuns] = useState<ExampleFlowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [agentFilePreview, setAgentFilePreview] = useState<AgentFilePreview | null>(null);
  const [isPreparingAgentFile, setIsPreparingAgentFile] = useState(false);
  const [isWritingAgentFile, setIsWritingAgentFile] = useState(false);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const cancelRunRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const status = await getAppStatus();
      setSeatAssignments(loadStoredSeatAssignments());
      if (cancelled || !status) {
        setProviderConfig(loadStoredProviderConfig());
        setCodexBridgeStatus(defaultCodexBridgeStatus);
        setClaudeBridgeStatus(defaultClaudeBridgeStatus);
        setBackendMode("demo");
        return;
      }

      setAppStatus(status);
      const bridgeStatus = await getBackendCodexBridgeStatus();
      if (!cancelled && bridgeStatus) {
        setCodexBridgeStatus(bridgeStatus);
      }
      const claudeStatus = await getBackendClaudeBridgeStatus();
      if (!cancelled && claudeStatus) {
        setClaudeBridgeStatus(claudeStatus);
      }
      const backendProviderConfig = await getBackendProviderConfig();
      let nextProviderConfig = backendProviderConfig
        ? normalizeProviderConfig(backendProviderConfig)
        : defaultProviderConfig;
      if (!cancelled && backendProviderConfig) {
        if (nextProviderConfig.mode === "local") {
          const endpointStatus = await checkBackendProviderEndpoint(nextProviderConfig);
          if (!cancelled && endpointStatus) {
            setProviderEndpointStatus(endpointStatus);
            setOllamaModels(endpointStatus.models);
          }
        } else if (nextProviderConfig.mode === "external" && nextProviderConfig.apiKeyStored) {
          const endpointStatus = await checkBackendProviderEndpoint(nextProviderConfig);
          if (!cancelled && endpointStatus) {
            setProviderEndpointStatus(endpointStatus);
          }
        } else if (nextProviderConfig.mode === "demo") {
          const ollamaStatus = await checkBackendProviderEndpoint(ollamaGemmaProviderPreset);
          if (ollamaStatus?.modelInstalled) {
            const saved = await saveBackendProviderConfig(ollamaGemmaProviderPreset);
            nextProviderConfig = normalizeProviderConfig(saved ?? ollamaGemmaProviderPreset);
            if (!cancelled) {
              setProviderEndpointStatus(ollamaStatus);
              setOllamaModels(ollamaStatus.models);
            }
          }
        }

        if (!cancelled) setProviderConfig(nextProviderConfig);
      }

      const [backendWorkflows, backendAgents] = await Promise.all([
        listBackendCustomWorkflows(),
        listBackendCustomAgents()
      ]);
      if (!cancelled && backendWorkflows) {
        const localWorkflows = loadStoredCustomWorkflows();
        const mergedWorkflows = mergeCustomItems(localWorkflows, backendWorkflows).slice(0, 24);
        setCustomWorkflows(mergedWorkflows);
        storeCustomWorkflows(mergedWorkflows);
        void Promise.allSettled(localWorkflows.map((workflow) => saveBackendCustomWorkflow(workflow)));
      }
      if (!cancelled && backendAgents) {
        const localAgents = loadStoredCustomAgents();
        const mergedAgents = mergeCustomItems(localAgents, backendAgents).map(normalizeAgentProfile).slice(0, 36);
        setCustomAgents(mergedAgents);
        storeCustomAgents(mergedAgents);
        void Promise.allSettled(localAgents.map((agent) => saveBackendCustomAgent(agent)));
      }

      const localProjects = await listBackendProjects();
      if (cancelled || !localProjects) return;

      const localRuns = await listBackendFlowRuns();
      if (!cancelled && localRuns) {
        setFlowRuns(localRuns);
        if (localRuns[0]) setSelectedRunId(localRuns[0].id);
      }

      if (localProjects.length > 0) {
        setProjects(localProjects);
        setSelectedProjectId(localProjects[0].id);
        setBackendMode("local");
      } else {
        setProjects([]);
        setBackendMode("empty");
      }
    }

    loadLocalState().catch(() => {
      if (!cancelled) {
        setProviderConfig(loadStoredProviderConfig());
        setSeatAssignments(loadStoredSeatAssignments());
        setCodexBridgeStatus(defaultCodexBridgeStatus);
        setClaudeBridgeStatus(defaultClaudeBridgeStatus);
        setBackendMode("demo");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? seedProjects[0];
  const availableWorkflows = useMemo(() => [...workflows, ...customWorkflows], [customWorkflows]);
  const availableAgents = useMemo(() => mergeAgentLibrary(agents, customAgents), [customAgents]);
  const customAgentIds = useMemo(() => new Set(customAgents.map((agent) => agent.id)), [customAgents]);
  const latestFlowRun = flowRuns[0] ?? null;
  const providerReadiness = useMemo(
    () => getProviderReadiness(providerConfig, backendMode, providerEndpointStatus),
    [backendMode, providerConfig, providerEndpointStatus]
  );
  const runReadiness = useMemo(
    () =>
      isDynamicWorkflow(selectedWorkflow)
        ? getWorkflowRunReadiness(
            selectedWorkflow,
            availableAgents,
            providerConfig,
            providerReadiness,
            codexBridgeStatus,
            claudeBridgeStatus,
            backendMode
          )
        : getCouncilRunReadiness(seatAssignments, providerReadiness, codexBridgeStatus, claudeBridgeStatus, backendMode),
    [
      availableAgents,
      backendMode,
      claudeBridgeStatus,
      codexBridgeStatus,
      providerConfig,
      providerReadiness,
      seatAssignments,
      selectedWorkflow
    ]
  );
  const selectProject = (project: Project) => setSelectedProjectId(project.id);
  const showToast = (message: string, actionLabel?: string, onAction?: () => void) => setToast({ message, actionLabel, onAction });
  const appendRunEvent = (entry: Omit<RunLogEntry, "id" | "timestampMs">) => {
    setRunEventLog((current) => [
      ...current,
      {
        ...entry,
        id: `${Date.now()}-${entry.nodeId}-${entry.status}-${current.length}`,
        timestampMs: Date.now()
      }
    ].slice(-18));
  };
  const updateSeatAssignment = (seatId: CouncilSeatId, runner: SeatRunner) => {
    setSeatAssignments((current) => {
      const next = normalizeSeatAssignments({ ...current, [seatId]: runner });
      storeSeatAssignments(next);
      return next;
    });
  };
  const handleProviderConfigChange = (config: ProviderConfig) => {
    setProviderConfig(normalizeProviderConfig(config));
    setProviderEndpointStatus(null);
  };
  const handleUseOllamaPreset = () => {
    handleProviderConfigChange(ollamaGemmaProviderPreset);
    showToast("Ollama Gemma preset loaded. Save provider to use it for live runs.");
  };
  const handleUseApplePreset = () => {
    handleProviderConfigChange(appleFoundationModelsProviderPreset);
    showToast("Apple Foundation Models preset loaded. Start fm serve, then save provider to use it for live runs.");
  };
  const handleCheckProviderEndpoint = async () => {
    if (isCheckingProvider) return;
    if (backendMode !== "local") {
      showToast("Launch the native app to check provider status from Settings.");
      return;
    }

    setIsCheckingProvider(true);
    const nextConfig = normalizeProviderConfig(providerConfig);
    try {
      const status = await checkBackendProviderEndpoint(nextConfig);
      if (!status) {
        showToast("Native app is required to check provider status.");
        return;
      }
      setProviderEndpointStatus(status);
      if (nextConfig.mode === "local") {
        const models = await listBackendOllamaModels(nextConfig);
        setOllamaModels(models ?? status.models);
      }
      showToast(status.detail);
    } catch (error) {
      showToast(errorMessage(error, "Provider status check failed"));
    } finally {
      setIsCheckingProvider(false);
    }
  };
  const projectCountLabel =
    backendMode === "local"
      ? `Indexed ${projects.length} local projects`
      : backendMode === "empty"
        ? "SQLite ready · run first scan"
        : `Demo preview · ${projects.length} sample projects`;
  const projectCountTone = backendMode === "demo" ? "review" : "ok";
  const runCount = runs.length + flowRuns.length;

  useEffect(() => {
    if (!selectedRunId && flowRuns[0]) setSelectedRunId(flowRuns[0].id);
  }, [flowRuns, selectedRunId]);

  useEffect(() => {
    if (!runReadiness.canRunLive && live) setLive(false);
  }, [live, runReadiness.canRunLive]);

  const resetProjectView = () => {
    setQuery("");
    setFilter("All");
  };

  const openWorkflows = (project?: Project) => {
    if (project) setSelectedProjectId(project.id);
    setActiveNav("workflows");
  };

  const handleCreateWorkflow = (draft: WorkflowDraft) => {
    const workflow = createWorkflowFromDraft(draft);
    setCustomWorkflows((current) => {
      const next = [workflow, ...current].slice(0, 12);
      storeCustomWorkflows(next);
      return next;
    });
    setSelectedWorkflow(workflow);
    if (backendMode === "local") {
      void saveBackendCustomWorkflow(workflow).catch((error) => {
        showToast(errorMessage(error, "Could not save workflow to SQLite"));
      });
    }
    showToast(`Created workflow template: ${workflow.name}`);
  };

  const handleUpdateWorkflow = (workflow: WorkflowType) => {
    if (!isCustomWorkflow(workflow)) return;
    setCustomWorkflows((current) => {
      const next = current.map((item) => (item.id === workflow.id ? workflow : item));
      storeCustomWorkflows(next);
      return next;
    });
    setSelectedWorkflow(workflow);
    if (backendMode === "local") {
      void saveBackendCustomWorkflow(workflow).catch((error) => {
        showToast(errorMessage(error, "Could not save workflow changes"));
      });
    }
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    setCustomWorkflows((current) => {
      const next = current.filter((workflow) => workflow.id !== workflowId);
      storeCustomWorkflows(next);
      return next;
    });
    if (selectedWorkflow.id === workflowId) {
      setSelectedWorkflow(workflows[0]);
    }
    if (backendMode === "local") {
      void deleteBackendCustomWorkflow(workflowId).catch((error) => {
        showToast(errorMessage(error, "Could not delete workflow from SQLite"));
      });
    }
    showToast("Deleted custom workflow");
  };

  const handleCreateAgent = (draft: AgentDraft) => {
    const agent = createCustomAgentFromDraft(draft);
    setCustomAgents((current) => {
      const next = [agent, ...current].slice(0, 24);
      storeCustomAgents(next);
      return next;
    });
    if (backendMode === "local") {
      void saveBackendCustomAgent(agent).catch((error) => {
        showToast(errorMessage(error, "Could not save agent to SQLite"));
      });
    }
    showToast(`Created agent: ${agent.name}`);
  };

  const handleUpdateAgent = (agent: AgentProfile) => {
    const nextAgent = normalizeAgentProfile(agent);
    setCustomAgents((current) => {
      const exists = current.some((candidate) => candidate.id === nextAgent.id);
      const next = exists
        ? current.map((candidate) => (candidate.id === nextAgent.id ? nextAgent : candidate))
        : [nextAgent, ...current];
      storeCustomAgents(next);
      return next;
    });
    if (backendMode === "local") {
      void saveBackendCustomAgent(nextAgent).catch((error) => {
        showToast(errorMessage(error, "Could not save agent changes to SQLite"));
      });
    }
    showToast(`Updated agent: ${nextAgent.name}`);
  };

  const handleDeleteAgent = (agentId: string) => {
    const agent = customAgents.find((candidate) => candidate.id === agentId);
    setCustomAgents((current) => {
      const next = current.filter((candidate) => candidate.id !== agentId);
      storeCustomAgents(next);
      return next;
    });
    if (backendMode === "local") {
      void deleteBackendCustomAgent(agentId).catch((error) => {
        showToast(errorMessage(error, "Could not delete agent from SQLite"));
      });
    }
    showToast(agent ? `Deleted agent: ${agent.name}` : "Deleted custom agent");
  };

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const result = await scanBackendProjects();
      if (!result) {
        showToast("Browser preview uses demo data. Launch with Tauri for local scans.");
        return;
      }

      const localProjects = await listBackendProjects();
      if (localProjects && localProjects.length > 0) {
        setProjects(localProjects);
        setSelectedProjectId(localProjects[0].id);
        setBackendMode("local");
      }
      const nextStatus = await getAppStatus();
      if (nextStatus) setAppStatus(nextStatus);
      showToast(`Scan indexed ${result.projectsFound} projects across ${result.rootsScanned} roots`, "Review");
    } catch (error) {
      showToast(errorMessage(error, "Local scan failed"));
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveProviderConfig = async () => {
    if (isSavingProvider) return;
    setIsSavingProvider(true);
    let nextConfig = normalizeProviderConfig(providerConfig);
    try {
      if (backendMode === "local") {
        const key = externalApiKeyInput.trim();
        if (nextConfig.mode === "external" && key) {
          const keyConfig = await saveBackendProviderApiKey(nextConfig.externalProvider, key);
          if (!keyConfig) {
            showToast("Native app is required to store provider API keys.");
            return;
          }
          nextConfig = normalizeProviderConfig({
            ...keyConfig,
            ...nextConfig,
            mode: "external",
            externalProvider: keyConfig.externalProvider,
            apiKeyStored: true
          });
          setExternalApiKeyInput("");
        }
        const saved = await saveBackendProviderConfig(nextConfig);
        if (!saved) {
          showToast("Native app is required to save provider settings.");
          return;
        }
        setProviderConfig(normalizeProviderConfig(saved));
        showToast("Provider settings saved for native runs.");
      } else {
        if (nextConfig.mode === "external" && externalApiKeyInput.trim()) {
          showToast("API keys can only be stored from the native app.");
        }
        storeProviderConfig(nextConfig);
        setProviderConfig(nextConfig);
        showToast("Provider settings saved for this browser preview.");
      }
    } catch (error) {
      showToast(errorMessage(error, "Provider settings could not be saved"));
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleClearProviderApiKey = async () => {
    if (isSavingProvider) return;
    if (backendMode !== "local") {
      showToast("Launch the native app to clear provider API keys.");
      return;
    }

    setIsSavingProvider(true);
    try {
      const saved = await clearBackendProviderApiKey(providerConfig.externalProvider);
      if (!saved) {
        showToast("Native app is required to clear provider API keys.");
        return;
      }
      const nextConfig = normalizeProviderConfig({ ...providerConfig, ...saved, apiKeyStored: false });
      setExternalApiKeyInput("");
      setProviderEndpointStatus(null);
      setProviderConfig(nextConfig);
      showToast("Stored provider API key cleared from macOS Keychain.");
    } catch (error) {
      showToast(errorMessage(error, "Provider API key could not be cleared"));
    } finally {
      setIsSavingProvider(false);
    }
  };

  const handleOpenProject = async (project: Project) => {
    try {
      const opened = await openBackendProject(project.id);
      showToast(opened ? `Opened ${project.name} in Finder` : `Browser preview cannot open ${project.name}`);
    } catch (error) {
      showToast(errorMessage(error, `Could not open ${project.name}`));
    }
  };

  const handleOpenTerminal = async (project: Project) => {
    try {
      const opened = await openBackendTerminal(project.id);
      showToast(opened ? `Opened terminal at ${project.path}` : `Browser preview cannot open Terminal`);
    } catch (error) {
      showToast(errorMessage(error, `Could not open Terminal`));
    }
  };

  const handleOpenRunArtifactFolder = async (run: ExampleFlowRun) => {
    try {
      const opened = await openBackendRunArtifactFolder(run.id);
      showToast(opened ? `Opened artifact folder for ${run.workflowName}` : "Native app is required to open artifact folders");
    } catch (error) {
      showToast(errorMessage(error, "Could not open the run artifact folder"));
    }
  };

  const handleCancelWorkflow = async () => {
    if (!isRunningFlow || isCancellingFlow) return;
    cancelRunRequestedRef.current = true;
    setIsCancellingFlow(true);
    appendRunEvent({
      nodeId: "run",
      label: "Cancel requested",
      detail: backendMode === "local" ? "Stopping the active backend run." : "Stopping the browser demo run.",
      status: "started",
      elapsedMs: null
    });
    setRunProgress((current) => current
      ? {
          ...current,
          label: "Cancelling run",
          detail: "Waiting for the active seat to stop."
        }
      : current);
    try {
      if (backendMode === "local") {
        const cancelled = await cancelBackendFlow();
        if (!cancelled) showToast("Native app is required to cancel backend runs.");
      }
    } catch (error) {
      showToast(errorMessage(error, "Could not cancel workflow run"));
    }
  };

  const handlePreviewAgentFile = async (project: Project) => {
    if (isPreparingAgentFile) return;
    setIsPreparingAgentFile(true);
    try {
      const backendPreview = backendMode === "local" ? await previewBackendAgentFile(project.id) : null;
      const preview = backendPreview ?? createDemoAgentFilePreview(project);
      setAgentFilePreview(preview);
      showToast(`${backendMode === "local" ? "Prepared" : "Demo"} AGENTS.md preview for ${project.name}`);
    } catch (error) {
      showToast(errorMessage(error, `Could not prepare AGENTS.md for ${project.name}`));
    } finally {
      setIsPreparingAgentFile(false);
    }
  };

  const handleCreateAgentFile = async (project: Project, content: string) => {
    if (backendMode !== "local") {
      showToast("Browser demo can preview AGENTS.md. Use the native app to write local files.");
      return;
    }
    if (isWritingAgentFile) return;
    setIsWritingAgentFile(true);
    try {
      const result = await writeBackendAgentFile(project.id, content);
      if (!result) {
        showToast("Native app is required to create AGENTS.md");
        return;
      }
      setProjects((current) => current.map((item) => (item.id === result.project.id ? result.project : item)));
      setSelectedProjectId(result.project.id);
      setAgentFilePreview(null);
      showToast(`Created AGENTS.md for ${result.project.name}`, "Scan now", () => void handleScan());
    } catch (error) {
      showToast(errorMessage(error, `Could not create AGENTS.md for ${project.name}`));
    } finally {
      setIsWritingAgentFile(false);
    }
  };

  const handleRunWorkflow = async () => {
    if (isRunningFlow) return;
    cancelRunRequestedRef.current = false;
    setIsCancellingFlow(false);
    setIsRunningFlow(true);
    setRunEventLog([]);
    const prompt = councilPrompt.trim() || defaultCouncilPrompt;
    const liveRun = runReadiness.canRunLive && live;
    const dynamicWorkflow = isDynamicWorkflow(selectedWorkflow);
    const workflowSteps = dynamicWorkflow
      ? [
          ...selectedWorkflow.nodes.map((node) => ({
            nodeId: node.id,
            timelineLabel: node.label,
            label: isLocalReportWriterNode(node) ? "Generating report artifacts" : `${node.label} running`,
            activeDetail: isLocalReportWriterNode(node)
              ? "Generating local report artifacts"
              : `Executing ${node.role || node.kind}`,
            doneDetail: isLocalReportWriterNode(node) ? "Report artifacts generated" : "Seat complete"
          })),
          {
            nodeId: "save",
            timelineLabel: "Save",
            label: "Saving report",
            activeDetail: "Saving the report to history",
            doneDetail: "Run saved"
          }
        ]
      : [...councilRunSteps];
    let unlistenProgress: (() => void) | null = null;
    try {
      if (liveRun && backendMode === "local") {
        setRunProgress({
          activeNodeId: workflowSteps[0]?.nodeId ?? "run",
          completedNodeIds: [],
          label: dynamicWorkflow ? "Starting workflow" : "Starting live Council",
          detail: "Waiting for the first assigned runner to begin."
        });
        unlistenProgress = await listenBackendFlowProgress((event) => {
          appendRunEvent({
            nodeId: event.nodeId,
            label: event.label,
            detail: event.detail,
            status: event.status,
            elapsedMs: event.elapsedMs
          });
          setRunProgress({
            activeNodeId: event.status === "started" ? event.nodeId : null,
            completedNodeIds: event.completedNodeIds,
            label: event.label,
            detail: event.elapsedMs
              ? `${event.detail} Elapsed: ${(event.elapsedMs / 1000).toFixed(1)}s.`
              : event.detail
          });
        });
      } else {
        for (let index = 0; index < workflowSteps.length; index += 1) {
          if (cancelRunRequestedRef.current) throw new Error("Workflow run cancelled by user.");
          const step = workflowSteps[index];
          const stepNode = dynamicWorkflow ? selectedWorkflow.nodes.find((node) => node.id === step.nodeId) : null;
          const runner = dynamicWorkflow
            ? stepNode && isLocalReportWriterNode(stepNode) ? "Local report writer" : "Demo model"
            : runnerForStep(step.nodeId, seatAssignments);
          const started = window.performance.now();
          appendRunEvent({
            nodeId: step.nodeId,
            label: step.label,
            detail: `${runner}: ${step.activeDetail}`,
            status: "started",
            elapsedMs: null
          });
          setRunProgress({
            activeNodeId: step.nodeId,
            completedNodeIds: workflowSteps.slice(0, index).map((item) => item.nodeId),
            label: step.label,
            detail: `${runner} assigned · demo simulation: ${step.activeDetail.toLowerCase()}`
          });
          await wait(index === 0 ? 420 : 560);
          if (cancelRunRequestedRef.current) throw new Error("Workflow run cancelled by user.");
          appendRunEvent({
            nodeId: step.nodeId,
            label: `${step.timelineLabel} complete`,
            detail: step.doneDetail,
            status: "completed",
            elapsedMs: Math.round(window.performance.now() - started)
          });
        }
      }

      const backendRun =
        backendMode === "local"
          ? dynamicWorkflow
            ? await runBackendCustomWorkflow(selectedProject.id, selectedWorkflow, liveRun, prompt, availableAgents)
            : await runBackendExampleFlow(selectedProject.id, selectedWorkflow.id, liveRun, prompt, seatAssignments)
          : null;
      if (cancelRunRequestedRef.current) throw new Error("Workflow run cancelled by user.");
      const rawRun = backendRun ?? (dynamicWorkflow
        ? createBrowserCustomWorkflowRun(selectedProject, selectedWorkflow, prompt)
        : createDemoFlowRun(selectedProject, selectedWorkflow, liveRun, prompt));
      const workflowRun = {
        ...rawRun,
        workflowId: selectedWorkflow.id,
        workflowName: selectedWorkflow.name
      };
      const run = dynamicWorkflow ? workflowRun : applySeatAssignmentsToRun(workflowRun, seatAssignments);
      setRunProgress({
        activeNodeId: null,
        completedNodeIds: workflowSteps.map((step) => step.nodeId),
        label: "Run saved",
        detail: liveRun ? "The Council report is ready" : "The fast demo report is ready"
      });
      setFlowRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 20));
      setSelectedRunId(run.id);
      setActiveNav("runs");
      showToast(`${liveRun ? run.workflowName : "Demo report"} report opened in Runs: ${run.verdict}`);
    } catch (error) {
      const message = errorMessage(error, "Multi-agent flow failed");
      const wasCancelled = message.toLowerCase().includes("cancelled");
      appendRunEvent({
        nodeId: "run",
        label: wasCancelled ? "Run cancelled" : "Run failed",
        detail: message,
        status: wasCancelled ? "completed" : "failed",
        elapsedMs: null
      });
      setRunProgress(wasCancelled
        ? {
            activeNodeId: null,
            completedNodeIds: [],
            label: "Run cancelled",
            detail: "No report was saved for this cancelled run."
          }
        : null);
      showToast(message);
    } finally {
      unlistenProgress?.();
      setIsRunningFlow(false);
      setIsCancellingFlow(false);
      cancelRunRequestedRef.current = false;
    }
  };

  return (
    <AppShell active={activeNav} onNavigate={setActiveNav}>
      <main className="main-surface">
        <TopBar query={query} setQuery={setQuery} onScan={handleScan} isScanning={isScanning} />

        <div className="page-title">
          <div>
            <p className="section-kicker">{activeNav === "command" ? "Overview" : navItems.find((item) => item.id === activeNav)?.label}</p>
            <h1>{activeNav === "command" ? "Command Center" : navItems.find((item) => item.id === activeNav)?.label}</h1>
          </div>
          <span className="state-chip">
            <span className={cx("status-dot", projectCountTone)} />
            {projectCountLabel}
          </span>
        </div>

        {activeNav === "command" && (
          <>
            <CommandCenter
              projects={projects}
              selected={selectedProject}
              selectProject={selectProject}
              openWorkflows={openWorkflows}
              runCount={runCount}
            />
            <ProjectWorkbench
              projects={projects}
              selected={selectedProject}
              selectProject={selectProject}
              query={query}
              filter={filter}
              setFilter={setFilter}
              onResetView={resetProjectView}
              onAnalyze={openWorkflows}
              onOpenProject={handleOpenProject}
              onOpenTerminal={handleOpenTerminal}
              backendMode={backendMode}
              agentFilePreview={agentFilePreview}
              isPreparingAgentFile={isPreparingAgentFile}
              isWritingAgentFile={isWritingAgentFile}
              onPreviewAgentFile={handlePreviewAgentFile}
              onCreateAgentFile={handleCreateAgentFile}
              onCloseAgentFilePreview={() => setAgentFilePreview(null)}
              onToast={showToast}
            />
          </>
        )}

        {activeNav === "projects" && (
          <ProjectWorkbench
            projects={projects}
            selected={selectedProject}
            selectProject={selectProject}
            query={query}
            filter={filter}
            setFilter={setFilter}
            onResetView={resetProjectView}
            onAnalyze={openWorkflows}
            onOpenProject={handleOpenProject}
            onOpenTerminal={handleOpenTerminal}
            backendMode={backendMode}
            agentFilePreview={agentFilePreview}
            isPreparingAgentFile={isPreparingAgentFile}
            isWritingAgentFile={isWritingAgentFile}
            onPreviewAgentFile={handlePreviewAgentFile}
            onCreateAgentFile={handleCreateAgentFile}
            onCloseAgentFilePreview={() => setAgentFilePreview(null)}
            onToast={showToast}
          />
        )}

        {activeNav === "workflows" && (
          <WorkflowStudio
            selectedProject={selectedProject}
            selectedWorkflow={selectedWorkflow}
            availableWorkflows={availableWorkflows}
            availableAgents={availableAgents}
            setSelectedWorkflow={setSelectedWorkflow}
            onCreateWorkflow={handleCreateWorkflow}
            onUpdateWorkflow={handleUpdateWorkflow}
            onDeleteWorkflow={handleDeleteWorkflow}
            live={live}
            setLive={setLive}
            backendMode={backendMode}
            providerConfig={providerConfig}
            providerReadiness={providerReadiness}
            runReadiness={runReadiness}
            codexBridgeStatus={codexBridgeStatus}
            claudeBridgeStatus={claudeBridgeStatus}
            seatAssignments={seatAssignments}
            onSeatAssignmentChange={updateSeatAssignment}
            councilPrompt={councilPrompt}
            setCouncilPrompt={setCouncilPrompt}
            latestFlowRun={latestFlowRun}
            runProgress={runProgress}
            runEventLog={runEventLog}
            isRunningFlow={isRunningFlow}
            isCancellingFlow={isCancellingFlow}
            onRunWorkflow={handleRunWorkflow}
            onCancelWorkflow={handleCancelWorkflow}
            onOpenRunArtifactFolder={handleOpenRunArtifactFolder}
          />
        )}

        {activeNav === "runs" && (
          <RunsPage
            selectedProject={selectedProject}
            flowRuns={flowRuns}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
            onOpenRunArtifactFolder={handleOpenRunArtifactFolder}
          />
        )}
        {activeNav === "agents" && (
          <AgentLibrary
            agents={availableAgents}
            customAgentIds={customAgentIds}
            localModels={ollamaModels}
            onCreateAgent={handleCreateAgent}
            onUpdateAgent={handleUpdateAgent}
            onDeleteAgent={handleDeleteAgent}
          />
        )}
        {activeNav === "settings" && (
          <SettingsPage
            appStatus={appStatus}
            backendMode={backendMode}
            providerConfig={providerConfig}
            externalApiKeyInput={externalApiKeyInput}
            providerEndpointStatus={providerEndpointStatus}
            providerReadiness={providerReadiness}
            ollamaModels={ollamaModels}
            onProviderConfigChange={handleProviderConfigChange}
            onExternalApiKeyInputChange={setExternalApiKeyInput}
            onSaveProviderConfig={handleSaveProviderConfig}
            onClearProviderApiKey={handleClearProviderApiKey}
            onUseOllamaPreset={handleUseOllamaPreset}
            onUseApplePreset={handleUseApplePreset}
            onCheckProviderEndpoint={handleCheckProviderEndpoint}
            isCheckingProvider={isCheckingProvider}
            isSavingProvider={isSavingProvider}
          />
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onClose={() => setToast(null)}
        />
      )}
    </AppShell>
  );
}
