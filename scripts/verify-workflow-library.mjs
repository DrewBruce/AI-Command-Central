import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/importedLibrary.ts", import.meta.url), "utf8");
const coreSource = await readFile(new URL("../src/data.ts", import.meta.url), "utf8");
const seatAssignmentsSource = await readFile(new URL("../src/seatAssignments.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const expectedReportWorkflows = [
  "architecture-decision-report",
  "market-sizing-report",
  "kpi-diagnostics-report",
  "vendor-comparison-report",
  "incident-review-report",
  "customer-research-synthesis"
];

for (const workflowId of expectedReportWorkflows) {
  assert.match(source, new RegExp(`id: "${workflowId}"`), `${workflowId} should exist in imported workflow library`);
}

for (const workflowId of expectedReportWorkflows) {
  const start = source.indexOf(`id: "${workflowId}"`);
  const end = source.indexOf("\n  },", start);
  const block = source.slice(start, end > start ? end : undefined);
  assert.match(block, /"html"\)/, `${workflowId} should have an HTML-producing report seat`);
}

assert.match(source, /scripts\/report-writer\.mjs/, "Local Report Writer should point at the reusable report writer script");
assert.match(source, /withLocalReportWriter/, "Report workflows should pass through local report writer injection");

const agentModelExpectations = [
  { source: coreSource, id: "researcher", model: "Claude Sonnet" },
  { source: coreSource, id: "critic", model: "Claude Sonnet" },
  { source: coreSource, id: "chair", model: "Claude Sonnet" },
  { source: coreSource, id: "judge", model: "Claude Sonnet" },
  { source: coreSource, id: "local-analyst", model: "Apple Foundation Models: system" },
  { source, id: "local-researcher", model: "Apple Foundation Models: system" },
  { source, id: "router-dispatcher", model: "Apple Foundation Models: system" },
  { source, id: "drift-auditor", model: "Apple Foundation Models: system" },
  { source, id: "editor", model: "Apple Foundation Models: system" },
  { source, id: "summariser", model: "Apple Foundation Models: system" },
  { source, id: "fact-checker", model: "Claude Sonnet" },
  { source, id: "devils-advocate", model: "Claude Sonnet" },
  { source, id: "risk-assessor", model: "Claude Sonnet" },
  { source, id: "forecast-analyst", model: "Claude Sonnet" },
  { source, id: "research-writer", model: "Claude Sonnet" },
  { source, id: "problem-solver", model: "Claude Sonnet" },
  { source, id: "html-report-producer", model: "Claude Sonnet" }
];

for (const expectation of agentModelExpectations) {
  const block = agentBlock(expectation.source, expectation.id);
  assert.match(
    block,
    new RegExp(`model: "${escapeRegExp(expectation.model)}"`),
    `${expectation.id} should default to ${expectation.model}`
  );
}

const defaultAssignments = objectBlock(seatAssignmentsSource, "defaultSeatAssignments");
assert.match(defaultAssignments, /scan: "local"/, "Council Scanner should default to the local Apple FM-capable runner");
assert.match(defaultAssignments, /risk: "claude"/, "Council Risk should default to Claude/Sonnet");
assert.match(defaultAssignments, /chair: "claude"/, "Council Chair should default to Claude/Sonnet");
assert.match(defaultAssignments, /judge: "claude"/, "Council Judge should default to Claude/Sonnet");

assert.match(source, /seat\.webSearch \? "researcher" : "local-researcher"/, "Research seats should distinguish web and no-web defaults");
assert.match(source, /router-dispatcher/, "Router or dispatcher seats should have an Apple FM default agent");
assert.match(appSource, /Default model policy/, "Agent defaults should be visible in the Agents UI");
assert.match(appSource, /Summariser, Editor/, "Agent defaults UI should include lightweight Apple FM seats");
assert.match(appSource, /Forecast Analyst, Research Writer, Problem Solver, HTML Report Producer/, "Agent defaults UI should include heavy Claude Sonnet seats");
assert.match(coreSource, /blocker taxonomy/, "Ship Readiness should include a release blocker taxonomy");
assert.match(coreSource, /go\/no-go recommendation/, "Ship Readiness should produce a go/no-go recommendation");
assert.match(coreSource, /source freshness notes/, "Research Sprint should include source freshness notes");
assert.match(coreSource, /local-report-writer/, "Core report workflows should end with Local Report Writer");

console.log(
  `Verified ${expectedReportWorkflows.length} report workflows, local report wiring, and ${agentModelExpectations.length} agent defaults.`
);

function agentBlock(text, id) {
  const start = text.indexOf(`id: "${id}",\n    name:`);
  assert.notEqual(start, -1, `${id} should exist in the agent library`);
  const end = text.indexOf("\n  }", start);
  assert.notEqual(end, -1, `${id} should have a complete agent block`);
  return text.slice(start, end);
}

function objectBlock(text, name) {
  const start = text.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const end = text.indexOf("\n};", start);
  assert.notEqual(end, -1, `${name} should have a complete object block`);
  return text.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
