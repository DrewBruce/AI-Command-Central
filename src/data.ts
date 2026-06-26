import type { AgentProfile, Project, RunRecord, TimelineStep, Workflow } from "./types";
import { importedAgents, importedWorkflows } from "./importedLibrary";

export const projects: Project[] = [
  {
    id: "acc",
    name: "AI-Command-Central",
    path: "/Users/andrewbruce/code/AI-Command-Central",
    agents: ["Claude", "Codex"],
    status: "Active",
    git: "Dirty",
    risk: "Needs agent file",
    confidence: 92,
    activity: "12 min ago",
    nextTask: "Design app shell and command-center workbench",
    notes: "New build should stay local-first, premium, and easier to reason about than Claude Central.",
    recentFiles: ["src/App.tsx", "src/styles.css", "docs/product-direction.md"],
    sessions: [
      { agent: "Codex", label: "UI redesign discussion", age: "today" },
      { agent: "Claude", label: "Workflow engine review", age: "yesterday" }
    ]
  },
  {
    id: "claude-central",
    name: "claude-central",
    path: "/Users/andrewbruce/code/claude-central",
    agents: ["Claude", "Codex", "Gemini"],
    status: "Recent",
    git: "Dirty",
    risk: "Review",
    confidence: 98,
    activity: "1 hr ago",
    nextTask: "Extract stable local-first scanner and orchestration ideas",
    notes: "Reference app only; useful backend shape but UI needs a cleaner IA.",
    recentFiles: ["src/components/Council.tsx", "src-tauri/src/council.rs", "docs/ROADMAP.md"],
    sessions: [
      { agent: "Claude", label: "Council run", age: "2 hrs ago" },
      { agent: "Codex", label: "Review pass", age: "today" }
    ]
  },
  {
    id: "prompt-library",
    name: "PromptLibrary",
    path: "/Users/andrewbruce/Sites/PromptLibrary",
    agents: ["Codex"],
    status: "Active",
    git: "Clean",
    risk: "Clear",
    confidence: 87,
    activity: "36 min ago",
    nextTask: "Add calibration output slot to forecasting prompt",
    notes: "Canonical markdown drives browser build and fallback snapshot.",
    recentFiles: ["library/forecasting.md", "scripts/build-browser.ts", "prompt.snapshot.txt"],
    sessions: [{ agent: "Codex", label: "Prompt maintenance", age: "today" }]
  },
  {
    id: "productivity",
    name: "Productivity",
    path: "/Users/andrewbruce/Documents/Productivity",
    agents: ["Claude", "Codex"],
    status: "Recent",
    git: "Ahead",
    risk: "Clear",
    confidence: 82,
    activity: "4 hrs ago",
    nextTask: "Review Drafts triage automation boundaries",
    notes: "Automations should inspect live state first and mutate conservatively.",
    recentFiles: ["daily-digest.md", "drafts-triage.md", "weekly-review.md"],
    sessions: [{ agent: "Claude", label: "Morning command center", age: "today" }]
  },
  {
    id: "vault-walkers",
    name: "Vault-Walkers",
    path: "/Users/andrewbruce/Documents/Writing/Fiction/Vault-Walkers",
    agents: ["Claude"],
    status: "Dormant",
    git: "Behind",
    risk: "Clear",
    confidence: 74,
    activity: "18 days ago",
    nextTask: "Run continuity check before next revision pass",
    notes: "Writing skills and continuity graph are the high-leverage tools here.",
    recentFiles: ["Book-1/Chapter-12.md", "Continuity/claims-ledger.md"],
    sessions: [{ agent: "Claude", label: "Revision pass", age: "last month" }]
  },
  {
    id: "business-concept",
    name: "Business Concept",
    path: "/Users/andrewbruce/Documents/Business Concept",
    agents: ["Codex", "Grok"],
    status: "Dormant",
    git: "Clean",
    risk: "Secret flagged",
    confidence: 63,
    activity: "41 days ago",
    nextTask: "Review trust-token architecture before investing more work",
    notes: "Weak Codex markers; keep attribution conservative until corroborated.",
    recentFiles: ["Assured Trust Stack.md", "architecture.md", ".env.local"],
    sessions: [{ agent: "Codex", label: "Architecture pressure test", age: "older" }]
  }
];

const coreWorkflows: Workflow[] = [
  {
    id: "project-review",
    name: "Project Review Council",
    description: "Researchers inspect context, a critic stress-tests, and a judge returns a clear next action.",
    seats: 5,
    runTime: "3-7 min",
    recommendedFor: "Ambiguous project state",
    nodes: [
      { id: "brief", label: "Context", x: 36, y: 98, kind: "input" },
      { id: "scan", label: "Scanner", x: 190, y: 38, kind: "research" },
      { id: "risk", label: "Risk", x: 190, y: 154, kind: "review" },
      { id: "chair", label: "Chair", x: 356, y: 98, kind: "review" },
      { id: "judge", label: "Judge", x: 524, y: 98, kind: "decision" }
    ],
    edges: [["brief", "scan"], ["brief", "risk"], ["scan", "chair"], ["risk", "chair"], ["chair", "judge"]]
  },
  {
    id: "ship-readiness",
    name: "Ship Readiness",
    description: "Checks code health, UX completion, release blockers, and produces a go/no-go decision.",
    seats: 5,
    runTime: "4-8 min",
    recommendedFor: "Before packaging",
    nodes: [
      { id: "scope", label: "Scope", x: 44, y: 96, kind: "input" },
      { id: "qa", label: "QA", x: 212, y: 42, kind: "review" },
      { id: "release", label: "Release", x: 212, y: 152, kind: "research" },
      { id: "gate", label: "Human Gate", x: 404, y: 96, kind: "human" },
      { id: "decision", label: "Decision", x: 572, y: 96, kind: "decision" }
    ],
    edges: [["scope", "qa"], ["scope", "release"], ["qa", "gate"], ["release", "gate"], ["gate", "decision"]]
  },
  {
    id: "research-sprint",
    name: "Research Sprint",
    description: "Parallel evidence gathering with web-search enabled seats and a compact synthesis report.",
    seats: 4,
    runTime: "2-5 min",
    recommendedFor: "Current facts",
    nodes: [
      { id: "question", label: "Question", x: 44, y: 98, kind: "input" },
      { id: "source-a", label: "Source A", x: 214, y: 42, kind: "research" },
      { id: "source-b", label: "Source B", x: 214, y: 154, kind: "research" },
      { id: "synthesis", label: "Synthesis", x: 432, y: 98, kind: "decision" }
    ],
    edges: [["question", "source-a"], ["question", "source-b"], ["source-a", "synthesis"], ["source-b", "synthesis"]]
  }
];

export const runs: RunRecord[] = [
  { id: "run-142", workflow: "Project Review Council", project: "claude-central", mode: "Live", outcome: "Needs revision", cost: "$0.42", duration: "6m 18s", time: "18 min ago" },
  { id: "run-141", workflow: "Research Sprint", project: "PromptLibrary", mode: "Live", outcome: "Saved", cost: "$0.17", duration: "3m 02s", time: "1 hr ago" },
  { id: "run-140", workflow: "Ship Readiness", project: "AI-Command-Central", mode: "Mock", outcome: "Approved", cost: "$0.00", duration: "42s", time: "today" },
  { id: "run-139", workflow: "Project Review Council", project: "Productivity", mode: "Live", outcome: "Saved", cost: "$0.28", duration: "5m 41s", time: "yesterday" }
];

const coreAgents: AgentProfile[] = [
  {
    id: "researcher",
    name: "Researcher",
    role: "Finds evidence and current facts",
    model: "Claude Haiku",
    authority: "Recommend",
    defaultTools: ["Web Search", "Files"],
    instructions: "Gather evidence, separate observed facts from inference, and cite the strongest signals.",
    webSearch: true,
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "critic",
    name: "Critic",
    role: "Finds weak assumptions and failure modes",
    model: "Codex",
    authority: "Recommend",
    defaultTools: ["Files"],
    instructions: "Pressure-test the current answer, identify failure modes, and name what would change the decision.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "chair",
    name: "Chair",
    role: "Synthesizes competing findings",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Transcript"],
    instructions: "Turn competing seat outputs into one practical recommendation and the next action.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "judge",
    name: "Judge",
    role: "Makes the final recommendation",
    model: "Codex",
    authority: "Decide",
    defaultTools: ["Transcript"],
    instructions: "Make the final call, state the basis, and include any caveats that matter before action.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "local-analyst",
    name: "Local Analyst",
    role: "Runs private local-model analysis and summarises tradeoffs",
    model: "Ollama: gemma4:26b",
    authority: "Recommend",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Use the supplied context only, avoid unsupported factual claims, and produce a compact recommendation.",
    outputFormat: "summary",
    localFit: "high"
  },
  {
    id: "human-gate",
    name: "Human Gate",
    role: "Requires explicit approval before action",
    model: "Person",
    authority: "Approve",
    defaultTools: ["Approval"],
    instructions: "Pause execution until Drew has approved the next action.",
    outputFormat: "summary",
    localFit: "low"
  }
];

export const workflows: Workflow[] = [...coreWorkflows, ...importedWorkflows];

export const agents: AgentProfile[] = [...coreAgents, ...importedAgents];

export const timeline: TimelineStep[] = [
  { label: "Context", state: "done", detail: "Question and project context prepared" },
  { label: "Scan", state: "done", detail: "Recent files and git read" },
  { label: "Risk", state: "active", detail: "Checking missing agent file" },
  { label: "Judge", state: "waiting", detail: "Queued" },
  { label: "Save", state: "waiting", detail: "Awaiting approval" }
];
