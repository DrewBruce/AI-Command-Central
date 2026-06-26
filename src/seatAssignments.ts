import type { BackendMode, ClaudeBridgeStatus, CodexBridgeStatus, CouncilSeatId, ProviderReadiness, SeatAssignmentMap, SeatRunner } from "./types";

export const seatAssignmentStorageKey = "ai-command-central.seat-assignments.v2";

export const councilSeatLabels: Record<CouncilSeatId, { label: string; role: string }> = {
  brief: { label: "Context packet", role: "Question + project context" },
  scan: { label: "Scanner", role: "Research" },
  risk: { label: "Risk", role: "Critic" },
  chair: { label: "Chair", role: "Synthesis" },
  judge: { label: "Judge", role: "Decision" }
};

export const seatRunnerOptions: Array<{ id: SeatRunner; label: string; detail: string }> = [
  { id: "system", label: "System", detail: "Deterministic app setup" },
  { id: "demo", label: "Demo model", detail: "Fast local simulation" },
  { id: "codex", label: "Codex agent", detail: "Codex CLI bridge" },
  { id: "claude", label: "Claude agent", detail: "Claude CLI bridge" },
  { id: "local", label: "Local model", detail: "Ollama or LM Studio" }
];

export const defaultSeatAssignments: SeatAssignmentMap = {
  brief: "system",
  scan: "codex",
  risk: "codex",
  chair: "claude",
  judge: "codex"
};

const seatIds: CouncilSeatId[] = ["brief", "scan", "risk", "chair", "judge"];
const runnerIds = new Set<SeatRunner>(seatRunnerOptions.map((option) => option.id));

export function normalizeSeatAssignments(value: Partial<SeatAssignmentMap> | null | undefined): SeatAssignmentMap {
  return seatIds.reduce((assignments, seatId) => {
    const runner = value?.[seatId];
    assignments[seatId] = runner && runnerIds.has(runner) ? runner : defaultSeatAssignments[seatId];
    return assignments;
  }, {} as SeatAssignmentMap);
}

export function loadStoredSeatAssignments(): SeatAssignmentMap {
  try {
    const raw = window.localStorage.getItem(seatAssignmentStorageKey);
    return normalizeSeatAssignments(raw ? JSON.parse(raw) : defaultSeatAssignments);
  } catch {
    return defaultSeatAssignments;
  }
}

export function storeSeatAssignments(assignments: SeatAssignmentMap) {
  window.localStorage.setItem(seatAssignmentStorageKey, JSON.stringify(normalizeSeatAssignments(assignments)));
}

export function seatRunnerLabel(runner: SeatRunner) {
  return seatRunnerOptions.find((option) => option.id === runner)?.label ?? "Demo model";
}

export function getCouncilRunReadiness(
  assignments: SeatAssignmentMap,
  providerReadiness: ProviderReadiness,
  codexStatus: CodexBridgeStatus,
  claudeStatus: ClaudeBridgeStatus,
  backendMode: BackendMode
): ProviderReadiness {
  if (backendMode !== "local") return providerReadiness;

  const runners = new Set(Object.values(assignments));
  const unavailable: string[] = [];
  const liveRunners: string[] = [];

  if (runners.has("codex")) {
    if (codexStatus.available) liveRunners.push("Codex");
    else unavailable.push("Codex CLI");
  }
  if (runners.has("claude")) {
    if (claudeStatus.available) liveRunners.push("Claude");
    else unavailable.push("Claude CLI");
  }
  if (runners.has("local")) {
    if (providerReadiness.canRunLive) liveRunners.push("Local model");
    else unavailable.push("Local model provider");
  }

  if (unavailable.length > 0) {
    return {
      tone: "warn",
      label: "Seat bridges needed",
      detail: `${unavailable.join(", ")} must be available before this roster can run live.`,
      runModeLabel: "Demo until bridges ready",
      canRunLive: false,
      issues: unavailable.map((item) => `${item} is not ready for live execution.`)
    };
  }

  if (liveRunners.length === 0) {
    return {
      tone: "review",
      label: "Demo simulation",
      detail: "All seats are assigned to system or demo runners.",
      runModeLabel: "Demo only",
      canRunLive: false,
      issues: ["Assign at least one live runner such as Codex or a local model."]
    };
  }

  return {
    tone: "ok",
    label: "Assigned runners ready",
    detail: `${liveRunners.join(", ")} can execute the assigned Council seats.`,
    runModeLabel: "Live assigned seats available",
    canRunLive: true,
    issues: []
  };
}

export function seatRunnerStatus(
  runner: SeatRunner,
  providerReadiness: ProviderReadiness,
  codexStatus: CodexBridgeStatus,
  claudeStatus: ClaudeBridgeStatus
) {
  if (runner === "system" || runner === "demo") {
    return { tone: "ok" as const, label: "Available now" };
  }
  if (runner === "codex") {
    return codexStatus.available
      ? { tone: "ok" as const, label: "Codex ready" }
      : { tone: "review" as const, label: "Bridge needed" };
  }
  if (runner === "claude") {
    return claudeStatus.available
      ? { tone: "ok" as const, label: "Claude ready" }
      : { tone: "review" as const, label: "Bridge needed" };
  }
  if (runner === "local") {
    return providerReadiness.canRunLive
      ? { tone: "ok" as const, label: "Live ready" }
      : { tone: "warn" as const, label: "Needs local provider" };
  }
  return { tone: "review" as const, label: "Bridge needed" };
}
