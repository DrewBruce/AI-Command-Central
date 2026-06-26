# AI Command Central

Local-first command center for AI-assisted project work. The app indexes local projects, manages agent/workflow templates, and can run seats through local CLI bridges or an OpenAI-compatible local model endpoint.

## Stack

- React + TypeScript + Vite frontend
- Tauri 2 desktop shell
- Rust backend with SQLite
- Local model provider support for Ollama/LM Studio-style endpoints and Apple Foundation Models via `fm serve`

## Development

```bash
npm install
npm run dev
```

Run the native desktop app:

```bash
npm run tauri:dev
```

## Checks

```bash
npm run build
npm run test:reports
cd src-tauri && cargo test
```

## Local Models

Ollama default:

```bash
ollama pull gemma4:26b
```

Apple Foundation Models on supported macOS builds:

```bash
fm serve --host 127.0.0.1 --port 1976
```

Then use Settings -> Local endpoint -> Use Apple Foundation Models in the app.
