import type { AgentProfile, Workflow } from "./types";

type ImportedSeat = {
  id: string;
  label: string;
  role: string;
  lane: string;
  model: "none" | "fast" | "reason" | "local" | "system";
  authority: "Recommend" | "Decide" | "Approve" | "Act";
  function: string;
  dependsOn: string[];
  webSearch?: boolean;
  tools?: string[];
  output?: "summary" | "markdown" | "html";
  human?: boolean;
  agentId?: string;
};

type ImportedWorkflow = {
  id: string;
  name: string;
  description: string;
  runTime: string;
  recommendedFor: string;
  lanes: string[];
  seats: ImportedSeat[];
};

export const importedAgents: AgentProfile[] = [
  {
    id: "requester",
    name: "Requester",
    role: "Captures the objective, context, constraints, and desired output before work begins",
    model: "System",
    authority: "Recommend",
    defaultTools: ["Brief"],
    instructions: "Restate the objective, constraints, success criteria, and any ambiguity. Do not answer the question.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Frames tradeoffs, patterns, options, and decision-relevant facts",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Files", "Transcript"],
    instructions: "Analyze the inputs against the objective. Surface tradeoffs, patterns, assumptions, and what matters most for the decision.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "producer",
    name: "Producer",
    role: "Creates the first concrete draft or deliverable",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Produce a complete first useful draft that satisfies the brief. Prefer a real artifact over commentary.",
    outputFormat: "markdown",
    localFit: "high"
  },
  {
    id: "reviewer",
    name: "Reviewer",
    role: "Reviews work against the objective for correctness, coverage, and quality",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Transcript"],
    instructions: "Review against the objective. List concrete issues, severity, evidence, and the specific fix needed.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "planner",
    name: "Planner",
    role: "Breaks goals into ordered steps with dependencies and done criteria",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Turn the objective into a practical plan: ordered steps, dependencies, risks, and what done looks like.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "executor",
    name: "Executor",
    role: "Carries out an approved step or packages the final handoff",
    model: "Codex",
    authority: "Act",
    defaultTools: ["Terminal read-only", "Files"],
    instructions: "Act only within the approved scope. Report exactly what was done, what changed, and any blocker.",
    outputFormat: "summary",
    localFit: "high"
  },
  {
    id: "drift-auditor",
    name: "Drift Auditor",
    role: "Checks whether a seat output stayed aligned to the original intent",
    model: "Claude Haiku",
    authority: "Recommend",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Judge whether the output answers the original intent. Flag off-topic work, ignored constraints, or invented goals.",
    outputFormat: "summary",
    localFit: "low"
  },
  {
    id: "html-report-producer",
    name: "HTML Report Producer",
    role: "Produces structured report content for the local writer",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Transcript"],
    instructions: "Produce bounded report content: sections, findings, tables, chart specs, evidence, caveats, and recommendation. Do not stream a complete HTML/PDF document; the app's local report writer assembles final artifacts.",
    outputFormat: "html",
    localFit: "low"
  },
  {
    id: "local-report-writer",
    name: "Local Report Writer",
    role: "Assembles run outputs into local report artifacts",
    model: "System",
    authority: "Act",
    defaultTools: ["Report manifest", "Local filesystem"],
    instructions: "Run locally inside AI Command Central after model seats finish. Use scripts/report-writer.mjs to stitch structured outputs into report_manifest.json, report.md, report.html, and later PDF exports without sending rich documents back through model streams.",
    outputFormat: "json",
    localFit: "high"
  },
  {
    id: "architecture-advisor",
    name: "Architecture Advisor",
    role: "Frames solution options, system boundaries, risks, and delivery tradeoffs",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Files", "Transcript"],
    instructions: "Produce decision-grade architecture content: context, options, tradeoffs, constraints, recommendation, delivery shape, and risks. Mark assumptions and verification needs.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "market-analyst",
    name: "Market Analyst",
    role: "Sizes opportunities with TAM/SAM/SOM, segments, assumptions, and confidence",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Web Search", "Transcript"],
    instructions: "Estimate market size using top-down and bottom-up methods. Separate knowns, assumptions, proxies, and confidence. Return structured ranges, not a single false-precision number.",
    webSearch: true,
    outputFormat: "markdown",
    localFit: "low"
  },
  {
    id: "metrics-analyst",
    name: "Metrics Analyst",
    role: "Diagnoses metric movement, KPI health, drivers, and next checks",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Data", "Transcript"],
    instructions: "Trace the metric definition, denominator, slices, drivers, anomalies, and missing data. Return diagnostic findings and the next analysis to run.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "vendor-analyst",
    name: "Vendor Analyst",
    role: "Compares vendors, products, capabilities, fit, and switching risks",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Web Search", "Transcript"],
    instructions: "Compare vendors against explicit decision criteria. Name evidence quality, open verification items, migration risks, and the conditions that would change the recommendation.",
    webSearch: true,
    outputFormat: "markdown",
    localFit: "low"
  },
  {
    id: "incident-reviewer",
    name: "Incident Reviewer",
    role: "Builds incident timelines, contributing factors, impacts, and prevention actions",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Logs", "Files", "Transcript"],
    instructions: "Create a blameless incident analysis: timeline, impact, detection, contributing factors, what worked, what failed, corrective actions, owners, and follow-up checks.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "customer-researcher",
    name: "Customer Researcher",
    role: "Synthesizes customer evidence into themes, needs, pain points, and product opportunities",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Notes", "Transcript"],
    instructions: "Cluster customer evidence into themes, representative quotes or paraphrases, severity, segment differences, unmet needs, and product implications. Keep claims tied to evidence strength.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "forecast-analyst",
    name: "Forecast Analyst",
    role: "Builds calibrated forecasts with drivers, turning points, and uncertainty",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Web Search", "Transcript"],
    instructions: "Give a calibrated probability or likelihood band, drivers, counterforces, turning points, and uncertainties. Mark estimates clearly.",
    webSearch: true,
    outputFormat: "html",
    localFit: "low"
  },
  {
    id: "codex-researcher",
    name: "Codex Researcher",
    role: "Runs read-only research and reasoning seats through Codex CLI",
    model: "Codex",
    authority: "Recommend",
    defaultTools: ["Read-only files", "Transcript"],
    instructions: "Answer from the supplied brief and available local context. If current web research is unavailable, say so clearly and still produce a useful bounded analysis.",
    outputFormat: "markdown",
    localFit: "medium"
  },
  {
    id: "codex-forecaster",
    name: "Codex Forecaster",
    role: "Builds calibrated forecast reports through Codex CLI",
    model: "Codex",
    authority: "Decide",
    defaultTools: ["Read-only files", "Transcript"],
    instructions: "Produce a calibrated forecast with probability band, drivers, counterforces, turning points, confidence, and caveats. Do not claim live web verification unless evidence is provided.",
    outputFormat: "html",
    localFit: "medium"
  },
  {
    id: "research-writer",
    name: "Research Writer",
    role: "Writes source-backed research briefs with evidence quality and confidence",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Web Search", "Transcript"],
    instructions: "Write a source-backed brief: bottom line, findings by sub-question, graded evidence, case against, and what would change the conclusion.",
    webSearch: true,
    outputFormat: "html",
    localFit: "low"
  },
  {
    id: "problem-solver",
    name: "Problem Solver",
    role: "Reframes the real problem and recommends a reversible next action",
    model: "Claude Sonnet",
    authority: "Decide",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Reframe the real problem, compare credible options, recommend one, give the first action, and pre-mortem the risks.",
    outputFormat: "html",
    localFit: "low"
  },
  {
    id: "fact-checker",
    name: "Fact-Checker",
    role: "Verifies load-bearing claims, figures, names, and dates",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Web Search", "Transcript"],
    instructions: "Mark each important claim as supported, unsupported, or uncertain. Flag stale, fabricated, or overstated evidence.",
    webSearch: true,
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "devils-advocate",
    name: "Devil's Advocate",
    role: "Argues the strongest case against the emerging conclusion",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Transcript"],
    instructions: "Steelman the opposition. Name assumptions that would break the recommendation and risks others are glossing over.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "risk-assessor",
    name: "Risk Assessor",
    role: "Identifies material risks, likelihood, impact, and early warning signs",
    model: "Claude Sonnet",
    authority: "Recommend",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Prioritize the risks that matter. For each, give likelihood, impact, mitigation, and an early warning signal.",
    outputFormat: "summary",
    localFit: "medium"
  },
  {
    id: "editor",
    name: "Editor",
    role: "Improves clarity, concision, structure, and correctness without changing meaning",
    model: "Claude Haiku",
    authority: "Recommend",
    defaultTools: ["Transcript"],
    instructions: "Edit for clarity, concision, structure, grammar, and tone. Preserve meaning. Return the improved text.",
    outputFormat: "markdown",
    localFit: "high"
  },
  {
    id: "summariser",
    name: "Summariser",
    role: "Condenses material into essential points, decisions, and open questions",
    model: "Ollama: gemma4:26b",
    authority: "Recommend",
    defaultTools: ["Brief", "Transcript"],
    instructions: "Lead with the bottom line. Preserve essential points, decisions, figures, and unresolved questions.",
    outputFormat: "summary",
    localFit: "high"
  }
];

const importedTemplateData: ImportedWorkflow[] = [
  {
    id: "judged-council",
    name: "Judged Council",
    description: "Researchers gather evidence, a Critic stress-tests it, a Chair synthesizes, and a Judge rules with a human gate before action.",
    runTime: "5-12 min",
    recommendedFor: "High-stakes decisions",
    lanes: ["Intake", "Research", "Critique", "Synthesis", "Judgement", "Action"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the objective and any attached context.", []),
      seat("rA", "Researcher A", "Researcher", "Research", "fast", "Recommend", "Gather evidence and arguments for the objective. Be concise and cite sources where possible.", ["req"], true, ["Web Search"]),
      seat("rB", "Researcher B", "Researcher", "Research", "fast", "Recommend", "Take a different angle from Researcher A and gather evidence or counter-evidence.", ["req"], true, ["Web Search"]),
      seat("rC", "Researcher C", "Researcher", "Research", "fast", "Recommend", "Focus on risks and counter-arguments that caution against the objective.", ["req"], true, ["Web Search"]),
      seat("crit", "Critic", "Critic", "Critique", "reason", "Recommend", "Stress-test the researchers: weak evidence, bias, missing context, and important risks.", ["rA", "rB", "rC"]),
      seat("chair", "Council Chair", "Chair", "Synthesis", "reason", "Recommend", "Synthesize findings and critique into one consolidated recommendation with dissent noted.", ["crit"]),
      seat("judge", "Judge", "Judge", "Judgement", "reason", "Decide", "Score the synthesis and end with Verdict: APPROVE, REVISE, or ESCALATE.", ["chair"]),
      seat("gate", "Human Gate", "Human Gate", "Action", "none", "Approve", "Require human approval before any external action proceeds.", ["judge"], false, [], "summary", true),
      seat("exec", "Executor", "Executor", "Action", "fast", "Act", "Execute only the approved action and log the result for audit.", ["gate"], false, ["Terminal read-only"])
    ]
  },
  {
    id: "simple-council",
    name: "Council",
    description: "A brief, three parallel advisors with distinct angles, and a Chair who synthesizes one recommendation.",
    runTime: "3-7 min",
    recommendedFor: "Balanced advice",
    lanes: ["Brief", "Deliberation", "Synthesis"],
    seats: [
      seat("brief", "Brief", "Entry", "Brief", "none", "Recommend", "Capture the objective, desired output, constraints, and success criteria.", []),
      seat("pragmatist", "Pragmatist", "Analyst", "Deliberation", "fast", "Recommend", "Recommend the most practical executable path with steps and tradeoffs.", ["brief"]),
      seat("skeptic", "Skeptic", "Risk Assessor", "Deliberation", "reason", "Recommend", "Stress-test the objective and rank risks with mitigations.", ["brief"]),
      seat("innovator", "Innovator", "Analyst", "Deliberation", "reason", "Recommend", "Widen the option space and propose a materially different approach if useful.", ["brief"]),
      seat("chair", "Council Chair", "Chair", "Synthesis", "reason", "Decide", "Synthesize the advisors into one direct recommendation and next steps.", ["pragmatist", "skeptic", "innovator"])
    ]
  },
  {
    id: "specialist-handoff",
    name: "Specialist Handoff",
    description: "A router classifies the objective and hands off to the best-fit specialist before final packaging.",
    runTime: "3-6 min",
    recommendedFor: "Unclear task type",
    lanes: ["Intake", "Routing", "Specialists", "Delivery"],
    seats: [
      seat("objective", "Objective", "Entry", "Intake", "none", "Recommend", "Capture the raw request, context, and hard constraints.", []),
      seat("router", "Router", "Analyst", "Routing", "fast", "Decide", "Route the objective to technical, research, or writing and explain why.", ["objective"]),
      seat("technical", "Technical Specialist", "Analyst", "Specialists", "reason", "Recommend", "Answer engineering, code, systems, data, or infrastructure requests precisely.", ["router"]),
      seat("research", "Research Specialist", "Researcher", "Specialists", "reason", "Recommend", "Answer factual, comparative, or synthesis requests with evidence and uncertainty.", ["router"], true, ["Web Search"]),
      seat("writing", "Writing Specialist", "Producer", "Specialists", "reason", "Recommend", "Draft, edit, summarize, or rewrite in the requested tone and format.", ["router"]),
      seat("finalizer", "Finalizer", "Executor", "Delivery", "fast", "Act", "Package the winning specialist output cleanly without redoing the work.", ["technical", "research", "writing"])
    ]
  },
  {
    id: "review-revision",
    name: "Review and Revision",
    description: "A Producer drafts, a Reviewer scores it against criteria, and a Finisher polishes after it passes.",
    runTime: "5-10 min",
    recommendedFor: "Draft quality",
    lanes: ["Brief", "Draft", "Review", "Finish", "Approval"],
    seats: [
      seat("brief", "Brief Intake", "Entry", "Brief", "none", "Recommend", "Capture deliverable, objective, constraints, and definition of done.", []),
      seat("criteria", "Criteria Setter", "Reviewer", "Brief", "reason", "Recommend", "Derive a weighted acceptance rubric tailored to the deliverable.", ["brief"]),
      seat("producer", "Producer", "Producer", "Draft", "reason", "Recommend", "Produce the complete draft or revise it against feedback.", ["criteria"]),
      seat("reviewer", "Reviewer", "Reviewer", "Review", "reason", "Decide", "Score the draft against the rubric and return PASS or REVISE with concrete fixes.", ["producer"]),
      seat("finisher", "Finisher", "Editor", "Finish", "reason", "Recommend", "Polish a passing draft without changing settled meaning.", ["reviewer"]),
      seat("signoff", "Human Sign-off", "Human Gate", "Approval", "none", "Approve", "Human reviews and approves or rejects the polished deliverable.", ["finisher"], false, [], "summary", true)
    ]
  },
  {
    id: "planner-executors",
    name: "Planner and Executors",
    description: "A planner splits the objective into parallel sub-tasks, executors work them, and an aggregator merges the result.",
    runTime: "5-10 min",
    recommendedFor: "Multi-step work",
    lanes: ["Intake", "Planning", "Execution", "Integration", "Delivery"],
    seats: [
      seat("objective", "Objective", "Entry", "Intake", "none", "Recommend", "Capture the goal, final deliverable, constraints, and open questions.", []),
      seat("planner", "Planner", "Planner", "Planning", "reason", "Recommend", "Decompose the goal into independent sub-tasks with done criteria.", ["objective"]),
      seat("execA", "Executor A", "Executor", "Execution", "fast", "Recommend", "Complete sub-task A and state assumptions or blockers.", ["planner"]),
      seat("execB", "Executor B", "Executor", "Execution", "fast", "Recommend", "Complete sub-task B and state assumptions or blockers.", ["planner"]),
      seat("execC", "Executor C", "Executor", "Execution", "fast", "Recommend", "Complete sub-task C and state assumptions or blockers.", ["planner"]),
      seat("aggregator", "Aggregator", "Chair", "Integration", "reason", "Decide", "Merge executor outputs, reconcile gaps, and decide whether ready.", ["execA", "execB", "execC"]),
      seat("delivery", "Delivery", "Executor", "Delivery", "fast", "Act", "Present the final deliverable in the requested format.", ["aggregator"])
    ]
  },
  {
    id: "controlled-action",
    name: "Controlled Action",
    description: "Plan an action, assess risk, get human approval, execute, then verify the outcome.",
    runTime: "5-12 min",
    recommendedFor: "Guarded tool use",
    lanes: ["Intake", "Plan", "Risk", "Approval", "Execution", "Verification"],
    seats: [
      seat("objective", "Objective", "Entry", "Intake", "none", "Recommend", "Capture the exact action, target, constraints, and success criteria.", []),
      seat("planner", "Planner", "Planner", "Plan", "reason", "Recommend", "Create an ordered plan with preconditions, rollback notes, and required tools.", ["objective"]),
      seat("risk", "Risk Assessor", "Risk Assessor", "Risk", "reason", "Decide", "Score risk, blast radius, reversibility, and required mitigations.", ["planner"]),
      seat("approver", "Human Gate", "Human Gate", "Approval", "none", "Approve", "Approve, reject, or request changes before execution.", ["risk"], false, [], "summary", true),
      seat("executor", "Executor", "Executor", "Execution", "fast", "Act", "Execute only the approved plan and log real operations and results.", ["approver"], false, ["Terminal read-only"]),
      seat("verifier", "Verifier", "Reviewer", "Verification", "reason", "Decide", "Verify the real end state against success criteria and flag side effects.", ["executor"])
    ]
  },
  {
    id: "local-private-brief",
    name: "Private Brief - local",
    description: "Fully on-device Gemma brief: extract facts, find gaps, and synthesize a one-page private brief.",
    runTime: "2-5 min",
    recommendedFor: "Private material",
    lanes: ["Intake", "Read", "Synthesis"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the material and the question to answer.", []),
      seat("extract", "Extractor", "Analyst", "Read", "local", "Recommend", "From provided material only, extract key facts, claims, figures, and dates.", ["req"]),
      seat("gaps", "Gap-finder", "Analyst", "Read", "local", "Recommend", "From provided material only, list gaps, ambiguities, risks, and open questions.", ["req"]),
      seat("brief", "Brief", "Chair", "Synthesis", "local", "Decide", "Write a one-page brief: summary, key points, unknowns, and recommendation.", ["extract", "gaps"])
    ]
  },
  {
    id: "local-draft-refine",
    name: "Draft and Refine - local",
    description: "A local Gemma writing pipeline: draft, critique, then polished final.",
    runTime: "3-6 min",
    recommendedFor: "Private first drafts",
    lanes: ["Intake", "Draft", "Critique", "Final"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture what to write, source material, tone, and constraints.", []),
      seat("draft", "Drafter", "Producer", "Draft", "local", "Recommend", "Write a complete first draft with clear structure and no filler.", ["req"]),
      seat("critique", "Critic", "Critic", "Critique", "local", "Recommend", "Critique the draft as numbered, actionable fixes.", ["draft"]),
      seat("final", "Finisher", "Editor", "Final", "local", "Decide", "Revise using the critique and output the polished final only.", ["critique"])
    ]
  },
  {
    id: "local-first-council",
    name: "Local-first Council - hybrid",
    description: "Run bulk analysis on local Gemma, then use a cloud Chair for the final call.",
    runTime: "4-8 min",
    recommendedFor: "Private but decisive",
    lanes: ["Intake", "Analysis", "Critique", "Decision"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the objective and context.", []),
      seat("aA", "Analyst A", "Analyst", "Analysis", "local", "Recommend", "Analyze one angle using provided context. Be concrete.", ["req"]),
      seat("aB", "Analyst B", "Analyst", "Analysis", "local", "Recommend", "Take a different angle from Analyst A.", ["req"]),
      seat("crit", "Critic", "Critic", "Critique", "local", "Recommend", "First-pass critique: weak claims, gaps, and checks needed.", ["aA", "aB"]),
      seat("chair", "Chair", "Chair", "Decision", "reason", "Decide", "Synthesize local outputs into one final recommendation.", ["aA", "aB", "crit"])
    ]
  },
  {
    id: "forecast-dashboard",
    name: "Forecast Dashboard",
    description: "Researchers gather live signals, then a Forecast Analyst produces a calibrated forecast report.",
    runTime: "5-12 min",
    recommendedFor: "Forecasting",
    lanes: ["Intake", "Signals", "Forecast"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the forecast question and time horizon.", []),
      withAgent(seat("sigA", "Signals A", "Researcher", "Signals", "fast", "Recommend", "Gather current signals, data, and expert views.", ["req"], false, ["Read-only files"]), "codex-researcher"),
      withAgent(seat("sigB", "Signals B", "Researcher", "Signals", "fast", "Recommend", "Gather base rates, counter-evidence, and consensus gaps.", ["req"], false, ["Read-only files"]), "codex-researcher"),
      withAgent(seat("forecast", "Forecast Analyst", "Forecast Analyst", "Forecast", "reason", "Decide", "Forecast with probability band, drivers, counterforces, turning points, and uncertainty.", ["sigA", "sigB"], false, ["Read-only files"], "html"), "codex-forecaster")
    ]
  },
  {
    id: "research-brief",
    name: "Research Brief",
    description: "Researchers gather evidence, a Fact-Checker verifies claims, and a Research Writer produces a source-backed brief.",
    runTime: "5-12 min",
    recommendedFor: "Source-backed research",
    lanes: ["Intake", "Research", "Verify", "Write-up"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the research question and constraints.", []),
      seat("rA", "Researcher A", "Researcher", "Research", "fast", "Recommend", "Gather evidence for the question with sources.", ["req"], true, ["Web Search"]),
      seat("rB", "Researcher B", "Researcher", "Research", "fast", "Recommend", "Take another angle and find disconfirming evidence.", ["req"], true, ["Web Search"]),
      seat("check", "Fact-Checker", "Fact-Checker", "Verify", "reason", "Recommend", "Verify load-bearing claims and flag stale or overstated evidence.", ["rA", "rB"], true, ["Web Search"]),
      seat("write", "Research Writer", "Research Writer", "Write-up", "reason", "Decide", "Produce a source-backed brief with confidence, evidence grades, and case against.", ["rA", "rB", "check"], true, ["Web Search"], "html")
    ]
  },
  {
    id: "decision-brief",
    name: "Decision Brief",
    description: "Frame the real problem, challenge it, assess risk, then deliver a decision brief.",
    runTime: "4-9 min",
    recommendedFor: "Important choices",
    lanes: ["Intake", "Frame", "Challenge", "Decide"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the decision, dilemma, and options already known.", []),
      seat("frame", "Analyst", "Analyst", "Frame", "reason", "Recommend", "Reframe the real problem and lay out credible options.", ["req"]),
      seat("adv", "Devil's Advocate", "Devil's Advocate", "Challenge", "reason", "Recommend", "Argue the strongest case against the leading option.", ["frame"]),
      seat("risk", "Risk Assessor", "Risk Assessor", "Challenge", "reason", "Recommend", "Identify material risks for each option.", ["frame"]),
      seat("solve", "Problem Solver", "Problem Solver", "Decide", "reason", "Decide", "Weigh options, recommend one, give first action, and pre-mortem it.", ["frame", "adv", "risk"], false, [], "html")
    ]
  },
  {
    id: "architecture-decision-report",
    name: "Architecture Decision Report",
    description: "Frame business context, compare solution options, assess risks, and produce a decision-grade architecture report.",
    runTime: "6-12 min",
    recommendedFor: "Architecture choices",
    lanes: ["Intake", "Context", "Options", "Risk", "Report"],
    seats: [
      seat("req", "Decision Brief", "Entry", "Intake", "none", "Recommend", "Capture the business question, decision deadline, constraints, and expected report audience.", []),
      withAgent(seat("context", "Context Mapper", "Architecture Advisor", "Context", "reason", "Recommend", "Map business drivers, system boundaries, integrations, non-functional requirements, and open assumptions.", ["req"], false, ["Files", "Transcript"]), "architecture-advisor"),
      withAgent(seat("options", "Options Architect", "Architecture Advisor", "Options", "reason", "Decide", "Compare do-least, local-first, and heavier platform options with tradeoffs, switch conditions, and delivery implications.", ["context"], false, ["Files", "Transcript"]), "architecture-advisor"),
      seat("risk", "Architecture Risk", "Risk Assessor", "Risk", "reason", "Recommend", "Identify material architecture risks, reversibility, operational load, data/security implications, and mitigations.", ["context", "options"]),
      seat("report", "Architecture Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a structured architecture decision report with recommendation, options, context, risks, roadmap, and open questions.", ["options", "risk"], false, [], "html")
    ]
  },
  {
    id: "market-sizing-report",
    name: "Market Sizing Report",
    description: "Estimate TAM/SAM/SOM, segment demand, confidence, and go-to-market implications before investing in an opportunity.",
    runTime: "6-12 min",
    recommendedFor: "Opportunity sizing",
    lanes: ["Intake", "Sizing", "Segments", "Verification", "Report"],
    seats: [
      seat("req", "Sizing Question", "Entry", "Intake", "none", "Recommend", "Capture the opportunity, geography, customer segment, time horizon, and monetization assumption.", []),
      withAgent(seat("tam", "TAM/SAM/SOM", "Market Analyst", "Sizing", "reason", "Recommend", "Create top-down and bottom-up market ranges with assumptions, proxies, and sensitivity notes.", ["req"], true, ["Web Search", "Transcript"]), "market-analyst"),
      withAgent(seat("segments", "Segment Analyst", "Market Analyst", "Segments", "reason", "Recommend", "Break the opportunity into customer segments, willingness-to-pay cues, adoption blockers, and wedge opportunities.", ["req"], true, ["Web Search", "Transcript"]), "market-analyst"),
      seat("check", "Sizing Check", "Fact-Checker", "Verification", "reason", "Recommend", "Check load-bearing claims, stale figures, source quality, and unsupported assumptions.", ["tam", "segments"], true, ["Web Search"]),
      seat("report", "Market Sizing Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a market sizing report with ranges, assumptions, evidence quality, segment priorities, caveats, and first validation steps.", ["tam", "segments", "check"], false, [], "html")
    ]
  },
  {
    id: "kpi-diagnostics-report",
    name: "KPI Diagnostics Report",
    description: "Diagnose why a metric moved, where the signal is weak, and what checks should happen next.",
    runTime: "5-10 min",
    recommendedFor: "Metric changes",
    lanes: ["Intake", "Definition", "Drivers", "Risk", "Report"],
    seats: [
      seat("req", "Metric Question", "Entry", "Intake", "none", "Recommend", "Capture the metric, observed change, time window, expected baseline, and available data sources.", []),
      withAgent(seat("definition", "Metric Definition", "Metrics Analyst", "Definition", "reason", "Recommend", "Clarify formula, denominator, source tables or files, exclusions, and known instrumentation risks.", ["req"], false, ["Data", "Transcript"]), "metrics-analyst"),
      withAgent(seat("drivers", "Driver Analysis", "Metrics Analyst", "Drivers", "reason", "Recommend", "Identify likely drivers, cuts to inspect, anomalies, seasonality, mix shifts, and data-quality checks.", ["definition"], false, ["Data", "Transcript"]), "metrics-analyst"),
      seat("risk", "Decision Risk", "Risk Assessor", "Risk", "reason", "Recommend", "Assess how much confidence the team should place in the metric and what action would be premature.", ["definition", "drivers"]),
      seat("report", "Diagnostics Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a KPI diagnostic report with what changed, likely drivers, evidence gaps, confidence, and next analysis/actions.", ["drivers", "risk"], false, [], "html")
    ]
  },
  {
    id: "vendor-comparison-report",
    name: "Vendor Comparison Report",
    description: "Compare vendors against explicit criteria, risks, migration effort, and fit before choosing a tool or platform.",
    runTime: "6-12 min",
    recommendedFor: "Tool selection",
    lanes: ["Intake", "Criteria", "Compare", "Risk", "Report"],
    seats: [
      seat("req", "Selection Brief", "Entry", "Intake", "none", "Recommend", "Capture the buyer, use case, must-haves, nice-to-haves, constraints, and candidate vendors.", []),
      withAgent(seat("criteria", "Criteria Builder", "Vendor Analyst", "Criteria", "reason", "Recommend", "Convert the brief into weighted decision criteria, disqualifiers, and verification questions.", ["req"], false, ["Transcript"]), "vendor-analyst"),
      withAgent(seat("compare", "Vendor Analyst", "Vendor Analyst", "Compare", "reason", "Recommend", "Compare candidates against the criteria, flag unknowns, and separate marketing claims from verified fit.", ["criteria"], true, ["Web Search", "Transcript"]), "vendor-analyst"),
      seat("risk", "Switching Risk", "Risk Assessor", "Risk", "reason", "Recommend", "Assess lock-in, migration effort, support risk, security/privacy concerns, and operational burden.", ["criteria", "compare"]),
      seat("report", "Vendor Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a vendor comparison report with recommendation, scorecard, risks, open verification items, and switch conditions.", ["compare", "risk"], false, [], "html")
    ]
  },
  {
    id: "incident-review-report",
    name: "Incident Review Report",
    description: "Turn incident notes into a blameless timeline, contributing factors, impact, and corrective action report.",
    runTime: "5-10 min",
    recommendedFor: "Post-incident review",
    lanes: ["Intake", "Timeline", "Causes", "Actions", "Report"],
    seats: [
      seat("req", "Incident Brief", "Entry", "Intake", "none", "Recommend", "Capture incident scope, affected users/systems, time window, evidence sources, and review audience.", []),
      withAgent(seat("timeline", "Timeline Builder", "Incident Reviewer", "Timeline", "reason", "Recommend", "Build the incident timeline from detection through resolution with evidence gaps called out.", ["req"], false, ["Logs", "Files", "Transcript"]), "incident-reviewer"),
      withAgent(seat("causes", "Contributing Factors", "Incident Reviewer", "Causes", "reason", "Recommend", "Identify contributing factors, detection gaps, response gaps, and what worked without assigning blame.", ["timeline"], false, ["Logs", "Files", "Transcript"]), "incident-reviewer"),
      seat("actions", "Corrective Actions", "Planner", "Actions", "reason", "Recommend", "Convert findings into corrective actions with owner type, priority, verification, and follow-up timing.", ["causes"]),
      seat("report", "Incident Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a blameless incident review report with timeline, impact, factors, actions, and remaining risks.", ["timeline", "causes", "actions"], false, [], "html")
    ]
  },
  {
    id: "customer-research-synthesis",
    name: "Customer Research Synthesis",
    description: "Synthesize interviews, notes, or feedback into customer themes, pain points, opportunity areas, and product recommendations.",
    runTime: "5-10 min",
    recommendedFor: "Customer evidence",
    lanes: ["Intake", "Themes", "Needs", "Opportunity", "Report"],
    seats: [
      seat("req", "Research Brief", "Entry", "Intake", "none", "Recommend", "Capture source material, audience, research questions, segment focus, and required output depth.", []),
      withAgent(seat("themes", "Theme Synthesizer", "Customer Researcher", "Themes", "reason", "Recommend", "Cluster evidence into themes, segment differences, and representative proof points or paraphrases.", ["req"], false, ["Notes", "Transcript"]), "customer-researcher"),
      withAgent(seat("needs", "Needs Analyst", "Customer Researcher", "Needs", "reason", "Recommend", "Identify customer jobs, pain severity, unmet needs, objections, and emotional or operational drivers.", ["themes"], false, ["Notes", "Transcript"]), "customer-researcher"),
      seat("opportunity", "Product Opportunity", "Problem Solver", "Opportunity", "reason", "Recommend", "Translate customer needs into product opportunities, prioritization criteria, and risky assumptions to test.", ["themes", "needs"]),
      seat("report", "Research Synthesis", "HTML Report Producer", "Report", "reason", "Decide", "Produce a customer research synthesis report with themes, evidence strength, product implications, and next research/actions.", ["themes", "needs", "opportunity"], false, [], "html")
    ]
  },
  {
    id: "proposal-red-team",
    name: "Proposal Red-Team",
    description: "Pressure-test a proposal from claims, counter-case, and risk angles before a go/fix/no-go report.",
    runTime: "4-9 min",
    recommendedFor: "Plan pressure tests",
    lanes: ["Intake", "Stress-test", "Verdict"],
    seats: [
      seat("req", "Proposal", "Entry", "Intake", "none", "Recommend", "Capture the proposal or plan to stress-test.", []),
      seat("check", "Fact-Checker", "Fact-Checker", "Stress-test", "reason", "Recommend", "Verify load-bearing claims and figures.", ["req"], true, ["Web Search"]),
      seat("adv", "Devil's Advocate", "Devil's Advocate", "Stress-test", "reason", "Recommend", "Make the strongest case against the proposal.", ["req"]),
      seat("risk", "Risk Assessor", "Risk Assessor", "Stress-test", "reason", "Recommend", "Identify material risks, showstoppers, and mitigations.", ["req"]),
      seat("report", "Stress-test Report", "HTML Report Producer", "Verdict", "reason", "Decide", "Write a go, fix, or no-go report with decisive reasons and required fixes.", ["check", "adv", "risk"], false, [], "html")
    ]
  },
  {
    id: "document-review",
    name: "Document Review",
    description: "Summarize a document, find gaps and risks, then produce a polished review report.",
    runTime: "4-8 min",
    recommendedFor: "Document critique",
    lanes: ["Intake", "Read", "Report"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the document review focus and constraints.", []),
      seat("sum", "Summariser", "Summariser", "Read", "fast", "Recommend", "Distill essential points, decisions, figures, and open questions.", ["req"]),
      seat("risk", "Risk Assessor", "Risk Assessor", "Read", "reason", "Recommend", "Identify gaps, risks, weak assumptions, and open questions.", ["req"]),
      seat("report", "Review Report", "HTML Report Producer", "Report", "reason", "Decide", "Produce a polished review report with key points, risks, and recommendations.", ["sum", "risk"], false, [], "html")
    ]
  },
  {
    id: "content-studio",
    name: "Content Studio",
    description: "Producer drafts, Critic and Fact-Checker review in parallel, and Editor delivers a polished final.",
    runTime: "4-9 min",
    recommendedFor: "Publish-ready writing",
    lanes: ["Intake", "Draft", "Check", "Polish"],
    seats: [
      seat("req", "Brief", "Entry", "Intake", "none", "Recommend", "Capture what to write, audience, tone, and source material.", []),
      seat("draft", "Drafter", "Producer", "Draft", "reason", "Recommend", "Write a complete first draft with strong structure.", ["req"]),
      seat("crit", "Critic", "Critic", "Check", "reason", "Recommend", "Critique clarity, structure, weak spots, and repetition.", ["draft"]),
      seat("check", "Fact-Checker", "Fact-Checker", "Check", "reason", "Recommend", "Verify factual claims, names, figures, and dates.", ["draft"], true, ["Web Search"]),
      seat("edit", "Editor", "Editor", "Polish", "reason", "Decide", "Apply critique and fact-check, then polish the final piece.", ["crit", "check"])
    ]
  },
  {
    id: "notes-to-actions",
    name: "Notes to Actions - hybrid",
    description: "Turn notes into an action list: local summary, then a cloud planner produces an HTML checklist.",
    runTime: "3-6 min",
    recommendedFor: "Meeting notes",
    lanes: ["Intake", "Distil local", "Plan cloud"],
    seats: [
      seat("req", "Notes", "Entry", "Intake", "none", "Recommend", "Capture or attach the meeting notes.", []),
      seat("sum", "Summariser", "Summariser", "Distil local", "local", "Recommend", "Distill decisions, key points, commitments, and follow-ups.", ["req"]),
      seat("plan", "Planner", "Planner", "Plan cloud", "reason", "Decide", "Turn notes into an action list with owners, due hints, priorities, and open questions.", ["sum"], false, [], "html")
    ]
  },
  {
    id: "plan-premortem",
    name: "Plan and Pre-mortem",
    description: "Draft a plan, pre-mortem it with risk and opposition, then ship a hardened plan.",
    runTime: "4-8 min",
    recommendedFor: "Plans before action",
    lanes: ["Intake", "Plan", "Pre-mortem", "Finalise"],
    seats: [
      seat("req", "Goal", "Entry", "Intake", "none", "Recommend", "Capture the goal, constraints, and deadline.", []),
      seat("plan", "Planner", "Planner", "Plan", "reason", "Recommend", "Break the goal into ordered steps, dependencies, and done criteria.", ["req"]),
      seat("risk", "Risk Assessor", "Risk Assessor", "Pre-mortem", "reason", "Recommend", "Assume the plan failed and explain likely causes and mitigations.", ["plan"]),
      seat("adv", "Devil's Advocate", "Devil's Advocate", "Pre-mortem", "reason", "Recommend", "Argue why the plan will not work and name risky assumptions.", ["plan"]),
      seat("final", "Hardened Plan", "Planner", "Finalise", "reason", "Decide", "Revise into a hardened plan with first action and mitigations.", ["plan", "risk", "adv"], false, [], "html")
    ]
  },
  {
    id: "document-review-hybrid",
    name: "Document Review - hybrid",
    description: "Local seats summarize and risk-scan a document before a cloud report producer writes the review.",
    runTime: "3-7 min",
    recommendedFor: "Cheaper document review",
    lanes: ["Intake", "Read local", "Report cloud"],
    seats: [
      seat("req", "Request", "Entry", "Intake", "none", "Recommend", "Capture the document review focus and constraints.", []),
      seat("sum", "Summariser", "Summariser", "Read local", "local", "Recommend", "Distill essential points, decisions, figures, and open questions.", ["req"]),
      seat("risk", "Risk Scan", "Risk Assessor", "Read local", "local", "Recommend", "Find gaps, risks, weak assumptions, and open questions.", ["req"]),
      seat("report", "Review Report", "HTML Report Producer", "Report cloud", "reason", "Decide", "Produce a polished review report from the local summary and risk scan.", ["sum", "risk"], false, [], "html")
    ]
  }
];

export const importedWorkflows: Workflow[] = importedTemplateData.map(withLocalReportWriter).map(templateToWorkflow);

function withLocalReportWriter(template: ImportedWorkflow): ImportedWorkflow {
  if (template.seats.some((seat) => seat.agentId === "local-report-writer" || seat.role === "Local Report Writer")) {
    return template;
  }

  const reportSources = template.seats.filter((seat) => seat.output === "html");
  if (reportSources.length === 0) {
    return template;
  }

  return {
    ...template,
    lanes: template.lanes.includes("Local report") ? template.lanes : [...template.lanes, "Local report"],
    seats: [
      ...template.seats,
      withAgent(
        seat(
          "local-report",
          "Local Report Writer",
          "Local Report Writer",
          "Local report",
          "system",
          "Act",
          "Run scripts/report-writer.mjs to assemble prior structured outputs into local report artifacts: report_manifest.json, report.md, report.html, and PDF-ready HTML.",
          reportSources.map((source) => source.id),
          false,
          ["Report manifest", "Local filesystem"],
          "summary"
        ),
        "local-report-writer"
      )
    ]
  };
}

function seat(
  id: string,
  label: string,
  role: string,
  lane: string,
  model: ImportedSeat["model"],
  authority: ImportedSeat["authority"],
  fn: string,
  dependsOn: string[],
  webSearch = false,
  tools: string[] = [],
  output: ImportedSeat["output"] = "summary",
  human = false
): ImportedSeat {
  return { id, label, role, lane, model, authority, function: fn, dependsOn, webSearch, tools, output, human };
}

function withAgent(seat: ImportedSeat, agentId: string): ImportedSeat {
  return { ...seat, agentId };
}

function templateToWorkflow(template: ImportedWorkflow): Workflow {
  const laneX = lanePositions(template.lanes);
  const seatsByLane = new Map<string, ImportedSeat[]>();
  template.seats.forEach((seat) => {
    seatsByLane.set(seat.lane, [...(seatsByLane.get(seat.lane) ?? []), seat]);
  });

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    seats: template.seats.length,
    runTime: template.runTime,
    recommendedFor: template.recommendedFor,
    nodes: template.seats.map((seat) => {
      const laneSeats = seatsByLane.get(seat.lane) ?? [seat];
      const index = laneSeats.findIndex((candidate) => candidate.id === seat.id);
      return {
        id: seat.id,
        label: seat.label,
        x: laneX.get(seat.lane) ?? 44,
        y: stackedY(index, laneSeats.length),
        kind: kindForSeat(seat),
        agentId: seat.agentId ?? agentIdForSeat(seat),
        role: seat.role,
        function: seat.function
      };
    }),
    edges: template.seats.flatMap((seat) => seat.dependsOn.map((dep) => [dep, seat.id] as [string, string]))
  };
}

function lanePositions(lanes: string[]) {
  const first = 42;
  const last = 614;
  const step = lanes.length <= 1 ? 0 : (last - first) / (lanes.length - 1);
  return new Map(lanes.map((lane, index) => [lane, Math.round(first + step * index)]));
}

function stackedY(index: number, count: number) {
  if (count <= 1) return 98;
  const spacing = Math.min(92, 220 / Math.max(1, count - 1));
  return Math.round(98 - ((count - 1) * spacing) / 2 + index * spacing);
}

function kindForSeat(seat: ImportedSeat): Workflow["nodes"][number]["kind"] {
  if (seat.human || seat.authority === "Approve") return "human";
  if (seat.model === "none" || /^entry/i.test(seat.role)) return "input";
  if (seat.role === "Local Report Writer") return "decision";
  if (seat.authority === "Decide" || seat.output === "html") return "decision";
  if (/critic|risk|review|check|verifier|auditor|advocate/i.test(seat.role)) return "review";
  return "research";
}

function agentIdForSeat(seat: ImportedSeat) {
  if (seat.model === "none" || /^entry/i.test(seat.role)) return undefined;
  if (seat.role.toLowerCase().includes("local report")) return "local-report-writer";
  if (seat.model === "local") return "local-analyst";
  const role = seat.role.toLowerCase();
  if (role.includes("forecast")) return "forecast-analyst";
  if (role.includes("research writer")) return "research-writer";
  if (role.includes("html report")) return "html-report-producer";
  if (role.includes("problem solver")) return "problem-solver";
  if (role.includes("fact-check")) return "fact-checker";
  if (role.includes("devil")) return "devils-advocate";
  if (role.includes("risk")) return "risk-assessor";
  if (role.includes("summar")) return "summariser";
  if (role.includes("editor")) return "editor";
  if (role.includes("planner")) return "planner";
  if (role.includes("executor") || role.includes("publisher") || role.includes("delivery")) return "executor";
  if (role.includes("producer") || role.includes("drafter")) return "producer";
  if (role.includes("reviewer") || role.includes("verifier")) return "reviewer";
  if (role.includes("chair")) return "chair";
  if (role.includes("judge")) return "judge";
  if (role.includes("critic")) return "critic";
  if (role.includes("research")) return "researcher";
  if (role.includes("analyst") || role.includes("specialist") || role.includes("router")) return "analyst";
  return undefined;
}
