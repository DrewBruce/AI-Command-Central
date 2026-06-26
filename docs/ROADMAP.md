# AI Command Central Roadmap

## Product Spine

AI Command Central should become a local-first command surface for choosing projects, asking a multi-agent Council for a decision, reviewing the answer, and safely moving into agent-assisted work.

The product should feel useful in browser demo mode, but native Tauri mode is the path to real local state, persisted runs, and future model/provider integrations.

## Phase 1 - Useful Demo Council

Status: browser demo implemented; native/live execution remains planned in later phases.

Goal: make the Project Review Council feel like a real decision workflow rather than a static mock.

Acceptance checks:

- A user can type a natural-language Council question.
- The run visibly moves through Brief, Researcher, Critic, Chair, Judge, and Save.
- The final report answers the question directly before showing project guardrails.
- The report includes assumptions, sources/context, caveats, confidence, and agent seat outputs.
- Browser mode is clearly labelled as demo/mock.
- Runs page shows the latest report as a readable artifact, not only a table row.

## Phase 2 - Native Local Backend

Status: planned.

Goal: make Tauri mode the real local operating surface.

Acceptance checks:

- Project scans persist to SQLite.
- Council runs persist with their full report contract.
- Run history can reload after app restart.
- Project readiness issues can be opened, reviewed, and acted on.
- Browser demo mode and native mode have clear labels and no misleading live-run affordances.

## Phase 3 - Safe Project Readiness

Status: planned.

Goal: turn project risk signals into safe, reviewable actions.

Acceptance checks:

- Projects missing agent context offer an `AGENTS.md` preview.
- The user can review generated content before any write.
- Secret/env risks remain inspect-only until explicitly handled.
- Dirty git state is surfaced with affected files and suggested next action.

## Phase 4 - Real Council Providers

Status: planned.

Goal: allow the Council to run against real local or provider-backed models.

Acceptance checks:

- A provider adapter interface exists for demo, local model, and external API modes.
- Provider state is visible before running.
- Live runs show model/tool scope and cost or local resource implications.
- Failures produce useful diagnostics without losing the draft question.

## Phase 5 - Workflow Expansion

Status: planned.

Goal: make Ship Readiness and Research Sprint distinct, useful workflows.

Acceptance checks:

- Each workflow has its own prompt shape, seat roles, progress labels, and report template.
- Research Sprint can attach source/evidence slots.
- Ship Readiness can produce a go/no-go decision with release blockers.
- Runs can be filtered by workflow, project, verdict, and mode.
