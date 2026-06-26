import type { AgentFilePreview, Project } from "./types";

export function buildAgentFileContent(project: Project) {
  const agents = project.agents.length > 0 ? project.agents.join(", ") : "None detected yet";
  return `# AGENTS.md

## Project
- Name: ${project.name}
- Path: ${project.path}
- Current git state: ${project.git}
- Current risk: ${project.risk}
- Next task: ${project.nextTask}
- Detected agents: ${agents}

## Local-First Rules
- Keep project context local unless Drew explicitly approves sharing it.
- Read existing docs and recent files before changing code.
- Do not run destructive git, file, package, or database commands without explicit approval.
- Do not inspect or print secrets from env files, keychains, tokens, or private config.
- Prefer small, reviewable changes with clear verification steps.

## Workflow
- Start by summarizing the requested outcome and the files likely to matter.
- Check the app's existing patterns before adding abstractions.
- Run the narrowest useful build, lint, or test command after edits.
- Report what changed, what was verified, and any remaining risk.

## Handoff Notes
- Use this file as the local agent context for Codex, Claude, and other coding agents.
- Keep future project-specific rules in this file so handoffs stay consistent.
`;
}

export function createDemoAgentFilePreview(project: Project): AgentFilePreview {
  const content = buildAgentFileContent(project);
  return {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    filePath: `${project.path}/AGENTS.md`,
    exists: project.recentFiles.includes("AGENTS.md"),
    content,
    lineCount: content.trimEnd().split("\n").length
  };
}
