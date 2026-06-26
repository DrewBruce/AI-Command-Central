import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/importedLibrary.ts", import.meta.url), "utf8");

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

console.log(`Verified ${expectedReportWorkflows.length} report workflows and local report script wiring.`);
