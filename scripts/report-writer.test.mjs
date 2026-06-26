import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReportArtifacts } from "./report-writer.mjs";

function sampleRun() {
  return {
    id: "flow:test/1",
    workflowId: "market-sizing-report",
    workflowName: "Market Sizing Report",
    projectId: "project-1",
    projectName: "AI Command Central",
    prompt: "Size the opportunity for local-first agent dashboards.",
    answer: "The opportunity is attractive if scoped to evidence-backed local workflows.",
    guardrail: "Use validated assumptions before acting.",
    assumptions: ["Pricing is not verified.", "The first market is power users."],
    sources: ["Workflow output", "Seat evidence"],
    caveats: ["Refresh market data before external publication."],
    confidence: 78,
    mode: "Live",
    status: "Completed",
    startedMs: 1000,
    finishedMs: 2500,
    summary: "Report generated from a structured workflow run.",
    verdict: "APPROVE",
    seats: [
      {
        seatId: "tam",
        label: "TAM Analyst",
        agent: "Market Analyst",
        role: "Market Analyst",
        status: "done",
        summary: "Estimated top-down and bottom-up market ranges.",
        evidence: ["Runner: Market Analyst", "Duration: 1.2s"]
      },
      {
        seatId: "local-report",
        label: "Local Report Writer",
        agent: "Local report writer",
        role: "Local Report Writer",
        status: "done",
        summary: "Assembled local artifacts.",
        evidence: ["Artifact set: report_manifest.json, report.md, report.html, run.json"]
      }
    ]
  };
}

test("generateReportArtifacts writes manifest, markdown, and html from run json", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "acc-report-writer-"));
  try {
    const result = await generateReportArtifacts(sampleRun(), dir);

    assert.deepEqual(result.files.sort(), ["report.html", "report.md", "report_manifest.json", "run.json"]);
    const manifest = JSON.parse(await readFile(path.join(dir, "report_manifest.json"), "utf8"));
    const markdown = await readFile(path.join(dir, "report.md"), "utf8");
    const html = await readFile(path.join(dir, "report.html"), "utf8");

    assert.equal(manifest.generatedBy, "AI Command Central local report writer");
    assert.equal(manifest.localReportWriter, true);
    assert.equal(manifest.artifacts.some((artifact) => artifact.path === "report.html"), true);
    assert.match(markdown, /# Market Sizing Report/);
    assert.match(markdown, /## Council Answer/);
    assert.match(html, /Market Sizing Report/);
    assert.match(html, /The opportunity is attractive/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
