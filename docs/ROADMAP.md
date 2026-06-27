# AI Command Central Roadmap

This roadmap is the working delivery board for AI Command Central. It should stay honest about three states:

- **Shipped**: implemented and covered by automated checks.
- **Built, needs native QA**: implemented enough to use, but still needs a real Tauri app pass.
- **Planned**: not yet implemented or not yet wired end to end.

## Product Spine

AI Command Central is a local-first command surface for choosing projects, asking multi-agent workflows for decisions or deliverables, reviewing the answer, and safely moving into agent-assisted work.

Browser mode should remain useful for inspection and demo. Native Tauri mode is the real operating surface for local scans, persistent state, live model/provider calls, CLI bridges, report artifacts, and guarded writes.

## Current Snapshot

| Area | Status | Evidence / Notes |
| --- | --- | --- |
| GitHub repository and README | Shipped | Repository is backed up and the GitHub page has visual README assets in `docs/assets/readme/`. |
| Browser command surface | Shipped | React/Vite app builds and browser demo mode remains available. |
| Native local backend | Built, partial native QA | Tauri/Rust backend, SQLite, scanner, provider config, runner, and artifact commands exist and pass tests. Native launch/restart and persistence evidence is recorded in `docs/NATIVE_QA_2026-06-27.md`. |
| Project scanning | Built, partial native QA | Scanner persists projects to SQLite and detects agent markers, git state, and secret-shaped env risk signals. Existing scan persistence is verified; new UI-triggered scan automation remains blocked. |
| Workflow and agent library | Shipped | Imported templates and agents are merged into the app; verifier checks report workflow wiring and agent defaults. |
| Agent default model policy | Shipped | Apple Foundation Models defaults are used for lightweight local seats; Claude Sonnet is default for heavier reasoning/report roles. The Agents view now shows the default policy table. |
| Apple Foundation Models support | Shipped | `fm serve` preset, provider checks, model routing, and local runner tests exist. Live `fm serve` smoke passed on 2026-06-27. |
| Local report writer | Shipped | `scripts/report-writer.mjs` creates `run.json`, `report_manifest.json`, `report.md`, and `report.html`; report workflows visibly end with Local Report Writer. |
| External provider support | Built, needs keyed native QA | OpenAI external mode has Keychain-backed API key storage, status checks, guarded missing-key errors, and OpenAI-compatible chat execution. It still needs a live keyed native run before calling it shipped. |
| Release packaging | Built, needs signing setup | `npm run tauri:build` succeeds locally. CI, release docs, and version alignment are in place; signing/notarization credentials and packaged installer checks remain. |
| GitHub issue backlog | Planned | No open issues currently track this roadmap. |

## Done: Native End-to-End QA

Goal: prove the existing native Tauri path works on a real local run, and record any gaps as issues or follow-up tasks.

Acceptance checks:

- Launch the native app with `npm run tauri:dev`.
- Run a real project scan and confirm project count, scan timestamp, and selected project details persist in SQLite.
- Restart the app and confirm project/run history reloads.
- Check local provider readiness for Apple Foundation Models with `fm serve --host 127.0.0.1 --port 1976`.
- Run at least one Apple FM local-model seat if the endpoint is available; otherwise record the exact blocked state.
- Check Codex and Claude bridge detection and run at least one bridge-backed workflow seat when available.
- Run a report workflow and confirm the terminal Local Report Writer seat creates `run.json`, `report_manifest.json`, `report.md`, and `report.html`.
- Capture the QA result in a committed note or GitHub issue if any acceptance check is blocked.

## Now: External Provider Support

Goal: make external provider mode real without compromising local-first safety.

Acceptance checks:

- Add a secure API key storage flow for external providers. **Built for OpenAI via macOS Keychain.**
- Implement an external OpenAI-compatible chat adapter behind the existing provider interface. **Built for OpenAI.**
- Keep local mode as the default path and clearly label external data movement before live runs. **Built in Settings readiness and run caveats.**
- Show provider state before execution, including missing key, invalid key, model unavailable, and request failure states. **Built for missing key, unsupported provider, model-list checks, and request failures; needs live keyed validation.**
- Record model/tool scope and estimated cost or usage metadata in live run receipts.
- Add Rust tests for external config normalization, missing key errors, successful response parsing, and diagnostic failure messages. **Built for URL normalization, missing key, unsupported provider, and response parsing.**
- Add frontend checks for external provider readiness states.

## Done: Agent Default Policy UI

Goal: expose the default model policy so users understand why a seat resolves to Apple FM, Claude, local, Codex, or system tooling.

Acceptance checks:

- Add a visible defaults panel in Agents or Settings with columns for Agent, Default, and Why. **Built in the Agents view.**
- Show Apple FM guidance for lightweight local tasks: summarise, edit, classify, route, extract, condense, and no-web structure. **Built.**
- Show Claude Sonnet guidance for critic, risk, chair, judge, fact-checking, web research, forecast, problem solving, and report production. **Built.**
- Make web vs no-web research defaults explicit. **Built.**
- Keep the current verifier coverage for default drift. **Built; `npm run test:reports` checks the panel anchors and agent defaults.**
- Add a small UI-level check or screenshot QA pass for the defaults panel. **Done in local Playwright QA.**

## Now: Safe Project Readiness Actions

Goal: turn readiness signals into safe, inspectable actions.

Acceptance checks:

- Projects missing agent context offer an `AGENTS.md` preview before any write. **Built.**
- The user can review generated content and explicitly approve the write. **Built in the drawer approval flow; native writes refuse to overwrite existing files.**
- Secret/env risks remain inspect-only; the app flags presence without reading or printing secret values. **Built and covered by scanner tests.**
- Dirty git state shows affected files, ahead/behind state, and suggested next action. **Built via project readiness signals in the drawer.**
- Readiness action outcomes are logged into run or project history.
- Tests cover preview generation, write confirmation, secret-risk non-disclosure, and dirty git parsing. **Preview, secret-risk, dirty-file parsing, and DB persistence are covered; write-confirmation history remains.**

## Done: Workflow Expansion

Goal: make Ship Readiness and Research Sprint distinct, useful workflows rather than generic council variants.

Acceptance checks:

- Ship Readiness has its own prompt shape, release blocker taxonomy, go/no-go verdict, and report template. **Built.**
- Research Sprint has source/evidence slots, source freshness notes, and synthesis output built for current facts. **Built.**
- Runs can be filtered by workflow, project, verdict, and mode. **Built.**
- Workflow cards make runner requirements visible before selection. **Built via runtime pills and runner health panels.**
- Report workflows keep bounded model output and local artifact assembly. **Built with Local Report Writer endings.**

## Now: Release Hardening

Goal: prepare the app for reliable installation and repeatable releases.

Acceptance checks:

- `npm run tauri:build` succeeds on the release machine. **Passed locally on 2026-06-27.**
- App versioning is explicit across `package.json`, Cargo metadata, and Tauri config. **All are currently `0.1.0`.**
- Signing and notarization steps are documented and, where possible, scripted. **Documented in `docs/RELEASE.md`; credentials/scripts remain.**
- Generated artifacts remain ignored and the repository stays clean after build/test/release commands. **Ignored paths remain untracked; verify before release.**
- README includes install/run guidance for a packaged app. **Built.**
- Add a CI workflow for build, report tests, and Rust tests. **Built in `.github/workflows/ci.yml`.**

## Next: GitHub Backlog

Goal: mirror this roadmap into trackable GitHub issues.

Acceptance checks:

- Create issues for native E2E QA, external provider support, agent default policy UI, readiness actions, workflow expansion, release hardening, and CI.
- Add labels such as `qa`, `provider`, `ui`, `safety`, `workflow`, `release`, and `docs`.
- Keep issue descriptions tied to the acceptance checks above.
- Close or update issues as each acceptance check becomes verified.

## Verification Commands

Run these before calling roadmap-driven implementation complete:

```bash
npm run build
npm run test:reports
cd src-tauri && cargo test
```

Native QA additionally requires:

```bash
npm run tauri:dev
fm serve --host 127.0.0.1 --port 1976
```
