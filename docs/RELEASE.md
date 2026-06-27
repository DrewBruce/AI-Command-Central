# Release Checklist

AI Command Central releases should be built from a clean `main` checkout on macOS.

## Version

Keep these three values aligned before a release:

- `package.json` `version`
- `src-tauri/Cargo.toml` `package.version`
- `src-tauri/tauri.conf.json` `version`

Current version: `0.1.0`.

## Required Checks

```bash
npm ci
npm run build
npm run test:reports
cd src-tauri && cargo test
```

Native smoke checks before tagging:

```bash
npm run tauri:dev
fm serve --host 127.0.0.1 --port 1976
```

Use the native app to verify:

- project list loads from SQLite
- provider settings load and save
- Apple Foundation Models status check passes when `fm serve` is running
- at least one report workflow writes `run.json`, `report_manifest.json`, `report.md`, and `report.html`

## Packaging

```bash
npm run tauri:build
```

Generated build artifacts must remain untracked. Confirm afterward:

```bash
git status --short --ignored
```

Expected ignored paths include `dist/`, `src-tauri/target/`, and local QA output folders.

## Signing And Notarization

Unsigned local builds are acceptable for development. Public macOS distribution needs:

- Apple Developer ID Application certificate
- Tauri signing identity configured for the release machine
- notarization Apple ID or App Store Connect API credentials
- a staple/notarization verification pass before publishing

Do not commit signing credentials, API keys, profiles, or notarization secrets.

## Publish

1. Confirm checks and native smoke results.
2. Update `docs/ROADMAP.md` with any release caveats.
3. Tag the release commit.
4. Upload packaged artifacts and release notes to GitHub Releases.
