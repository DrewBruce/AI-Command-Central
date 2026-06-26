import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

export async function generateReportArtifacts(runOrPath, outDir) {
  const run = typeof runOrPath === "string" ? JSON.parse(await readFile(runOrPath, "utf8")) : runOrPath;
  const outputDir = outDir ?? (typeof runOrPath === "string" ? path.dirname(runOrPath) : process.cwd());
  await mkdir(outputDir, { recursive: true });

  const artifacts = {
    "run.json": `${JSON.stringify(run, null, 2)}\n`,
    "report_manifest.json": `${JSON.stringify(reportManifest(run), null, 2)}\n`,
    "report.md": reportMarkdown(run),
    "report.html": reportHtml(run)
  };

  await Promise.all(
    Object.entries(artifacts).map(([filename, content]) => writeFile(path.join(outputDir, filename), content))
  );

  return {
    dir: outputDir,
    files: Object.keys(artifacts)
  };
}

function reportManifest(run) {
  const sections = [
    { id: "question", title: "Council Question", kind: "text", source: "run.prompt" },
    { id: "answer", title: "Council Answer", kind: "text", source: "run.answer" },
    { id: "guardrail", title: "Project Guardrail", kind: "text", source: "run.guardrail" },
    { id: "summary", title: "Summary", kind: "text", source: "run.summary" },
    { id: "assumptions", title: "Assumptions", kind: "list", source: "run.assumptions" },
    { id: "sources", title: "Inputs and Evidence", kind: "list", source: "run.sources" },
    { id: "caveats", title: "Caveats", kind: "list", source: "run.caveats" },
    ...(run.seats ?? []).map((seat) => ({
      id: `seat-${safeSegment(seat.seatId)}`,
      title: seat.label,
      kind: "seat-output",
      source: `run.seats.${seat.seatId}`
    }))
  ];

  return {
    formatVersion: "1",
    runId: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    projectName: run.projectName,
    generatedBy: "AI Command Central local report writer",
    localReportWriter: true,
    sourceArtifact: "run.json",
    artifacts: [
      { kind: "source", path: "run.json" },
      { kind: "manifest", path: "report_manifest.json" },
      { kind: "markdown", path: "report.md" },
      { kind: "html", path: "report.html" }
    ],
    sections
  };
}

function reportMarkdown(run) {
  const lines = [
    `# ${run.workflowName ?? "Workflow Report"}`,
    "",
    `- Project: ${run.projectName ?? "Unknown project"}`,
    `- Mode: ${run.mode ?? "Unknown"}`,
    `- Verdict: ${run.verdict ?? "Unknown"}`,
    `- Confidence: ${run.confidence ?? "n/a"}%`,
    `- Duration: ${durationLabel((run.finishedMs ?? 0) - (run.startedMs ?? 0))}`,
    "",
    "## Council Question",
    run.prompt ?? "",
    "",
    "## Council Answer",
    run.answer ?? "",
    "",
    "## Project Guardrail",
    run.guardrail ?? "",
    "",
    "## Summary",
    run.summary ?? "",
    "",
    ...markdownList("Assumptions", run.assumptions),
    ...markdownList("Inputs and Evidence", run.sources),
    ...markdownList("Caveats", run.caveats),
    "## Seats",
    ""
  ];

  for (const seat of run.seats ?? []) {
    lines.push(
      `### ${seat.label}`,
      "",
      `- Runner: ${seat.agent}`,
      `- Role: ${seat.role}`,
      `- Status: ${seat.status}`,
      "",
      seat.summary ?? "",
      ""
    );
    if (seat.evidence?.length) {
      lines.push("Evidence:", ...seat.evidence.map((item) => `- ${item}`), "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function markdownList(title, items = []) {
  return [`## ${title}`, "", ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- No entries recorded."]), ""];
}

function reportHtml(run) {
  const seats = (run.seats ?? [])
    .map((seat) => `
      <article>
        <h3>${escapeHtml(seat.label)}</h3>
        <p><strong>${escapeHtml(seat.agent)}</strong> · ${escapeHtml(seat.role)}</p>
        <p>${escapeHtml(seat.summary ?? "")}</p>
        ${htmlList(seat.evidence)}
      </article>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(run.workflowName ?? "Workflow Report")}</title>
  <style>${artifactCss()}</style>
</head>
<body>
  <main>
    <header>
      <p>${escapeHtml(run.mode ?? "Unknown")} · ${escapeHtml(run.projectName ?? "Unknown project")} · ${escapeHtml(durationLabel((run.finishedMs ?? 0) - (run.startedMs ?? 0)))}</p>
      <h1>${escapeHtml(run.workflowName ?? "Workflow Report")}</h1>
      <span>Verdict: ${escapeHtml(run.verdict ?? "Unknown")}</span>
    </header>
    <section><h2>Council Question</h2><p>${escapeHtml(run.prompt ?? "")}</p></section>
    <section class="answer"><h2>Council Answer</h2><p>${escapeHtml(run.answer ?? "")}</p></section>
    <section><h2>Project Guardrail</h2><p>${escapeHtml(run.guardrail ?? "")}</p></section>
    <section><h2>Summary</h2><p>${escapeHtml(run.summary ?? "")}</p></section>
    <div class="grid">
      <section><h2>Assumptions</h2>${htmlList(run.assumptions)}</section>
      <section><h2>Inputs and Evidence</h2>${htmlList(run.sources)}</section>
      <section><h2>Caveats</h2>${htmlList(run.caveats)}</section>
    </div>
    <section><h2>Seats</h2><div class="seats">${seats}</div></section>
  </main>
</body>
</html>
`;
}

function htmlList(items = []) {
  const listItems = (items.length > 0 ? items : ["No entries recorded."])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<ul>${listItems}</ul>`;
}

function safeSegment(value = "") {
  const segment = String(value)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || "run";
}

function durationLabel(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}m ${remainder}s`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function artifactCss() {
  return "body{margin:0;background:#071016;color:#e7edf4;font:15px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 22px 56px}header{border:1px solid #264454;background:#0d1b24;border-radius:12px;padding:22px}header p{margin:0 0 8px;color:#93a5b7}header h1{margin:0 0 14px;font-size:32px}header span{display:inline-block;border:1px solid #5fd2e8;border-radius:999px;padding:6px 10px;color:#6be6ff;font-weight:700}section{margin-top:18px;border:1px solid #1d3340;background:#0a141c;border-radius:10px;padding:18px}.answer{background:#0d211c;border-color:#315a48}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.seats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}article{border:1px solid #203644;background:#081119;border-radius:10px;padding:14px}h2{margin:0 0 10px;font-size:16px}h3{margin:0 0 8px}ul{margin:0;padding-left:18px}@media print{body{background:white;color:#111}header,section,article{background:white;border-color:#ccc}header span{color:#075166;border-color:#075166}}@media(max-width:760px){.grid{grid-template-columns:1fr}main{padding:18px 12px}header h1{font-size:24px}}";
}

function parseCliArgs(argv) {
  const args = { run: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--run") args.run = argv[++index] ?? "";
    else if (item === "--out") args.out = argv[++index] ?? "";
    else if (!args.run) args.run = item;
    else if (!args.out) args.out = item;
  }
  return args;
}

if (process.argv[1] === scriptPath) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.run) {
    console.error("Usage: node scripts/report-writer.mjs --run path/to/run.json --out path/to/output");
    process.exit(2);
  }
  generateReportArtifacts(args.run, args.out || path.dirname(args.run))
    .then((result) => {
      console.log(`Generated report artifacts in ${result.dir}: ${result.files.join(", ")}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
