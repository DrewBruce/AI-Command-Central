import type { ExampleFlowRun, Project, Workflow } from "./types";

function isProjectQuestion(prompt: string) {
  return /\b(this repo|this project|current project|codebase|source code|git|dirty git|build error|ship this app|release this app|tauri|command central|agent file|agents edit|scan this project|open terminal)\b/i.test(prompt);
}

function isLocalAiHardwareQuestion(prompt: string) {
  return /\b(mac studio|dgx spark|dtx spark|dxg spark|local llm|local llms|local lmm|local lmms|cuda|nvidia|ai workstation|separate mac)\b/i.test(prompt);
}

function hasDgxTypo(prompt: string) {
  return /\b(dtx spark|dxg spark)\b/i.test(prompt);
}

function isPhotoQuestion(prompt: string) {
  return /\b(photo|photos|photograph|photography|camera|portrait|landscape|light)\b/i.test(prompt);
}

function verdictFor(project: Project, prompt: string): ExampleFlowRun["verdict"] {
  if (!isProjectQuestion(prompt)) return "APPROVE";
  if (project.risk === "Secret flagged" || project.risk === "Needs agent file" || project.git === "Dirty") {
    return "REVISE";
  }
  return "APPROVE";
}

function firstFiles(project: Project) {
  return project.recentFiles.length > 0 ? project.recentFiles.slice(0, 3) : ["No recent files indexed yet"];
}

function cleanPrompt(prompt: string) {
  return prompt.trim() || "Review this project state and recommend the next useful move.";
}

function answerFor(prompt: string, project: Project, verdict: ExampleFlowRun["verdict"]) {
  if (isLocalAiHardwareQuestion(prompt)) {
    const prefix = hasDgxTypo(prompt) ? "Interpreting DTX/DXG Spark as NVIDIA DGX Spark: " : "";
    return `${prefix}Given you already have a Mac as your primary machine and will still use commercial LLMs like Codex and Claude, buy the highest-memory Mac Studio first. It is the lower-friction local LLM workstation for a Mac-first workflow: macOS, Metal, MLX, Ollama, LM Studio, and easy file handoff beside your daily setup. DGX Spark is the better choice only if you specifically need NVIDIA CUDA, Linux containers, or deployment parity with NVIDIA infrastructure. With no budget constraint, the practical order is Mac Studio now; add DGX Spark later if CUDA-only tooling becomes a real requirement.`;
  }

  if (/\b(photo|photos|photograph|photography|camera|portrait|landscape|light)\b/i.test(prompt)) {
    return "Best default: shoot during golden hour, either the first hour after sunrise or the last hour before sunset. Use blue hour for city lights and atmosphere, overcast daylight for soft portraits, and avoid harsh midday sun unless you deliberately want strong shadows.";
  }

  if (isProjectQuestion(prompt)) {
    return verdict === "REVISE"
      ? `Do not let agents make broad edits yet. First fix the project guardrail issue: ${project.risk === "Needs agent file" ? "add or review the agent context file" : project.risk.toLowerCase()}, then rerun the Council.`
      : `The project is clear enough for a constrained agent run. Start with ${project.nextTask.toLowerCase()} and keep the run scoped to reviewed files.`;
  }

  return "The Council recommends answering the Council question directly, then checking only the project guardrails that could affect execution. No project blocker changes the answer to this general question.";
}

function guardrailFor(project: Project, prompt: string) {
  if (!isProjectQuestion(prompt)) {
    return `Project guardrail noted separately: ${project.name} is ${project.git.toLowerCase()} and marked ${project.risk.toLowerCase()}, but that does not change the answer to this general question.`;
  }
  return `Project guardrail: ${project.git} git state, ${project.risk} risk.`;
}

function reportContextFor(
  prompt: string,
  project: Project,
  verdict: ExampleFlowRun["verdict"]
): Pick<ExampleFlowRun, "assumptions" | "sources" | "caveats" | "confidence"> {
  if (isLocalAiHardwareQuestion(prompt)) {
    const assumptions = [
      "Your existing Mac remains the main working environment, so workflow friction matters.",
      "Commercial LLMs continue to handle some tasks, so the local machine is for privacy, latency, experimentation, and offline work.",
      "CUDA-only tooling is valuable only if you expect NVIDIA deployment parity."
    ];
    if (hasDgxTypo(prompt)) {
      assumptions.unshift("DTX/DXG Spark is interpreted as NVIDIA DGX Spark.");
    }

    return {
      assumptions,
      sources: [
        "Council question from Drew",
        `Project context: ${project.name}`,
        "Existing machine context supplied in the question",
        "Mac-native path: Metal, MLX, Ollama, LM Studio",
        "NVIDIA path: CUDA, Linux containers, DGX-style workflow"
      ],
      caveats: [
        "Confirm target model sizes, quantization, and memory needs before buying hardware.",
        "Fast demo mode is not live web research; treat prices and current specs as unverified.",
        "If your must-have tools require CUDA, the recommendation flips toward DGX Spark."
      ],
      confidence: 72
    };
  }

  if (isPhotoQuestion(prompt)) {
    return {
      assumptions: [
        "The goal is attractive natural light rather than a documentary or studio constraint.",
        "You can choose the shooting window rather than reacting to a fixed event time."
      ],
      sources: ["Council question from Drew", "Light-quality heuristic: golden hour, blue hour, overcast daylight"],
      caveats: [
        "Weather, subject direction, and location shadowing can change the best window.",
        "Midday can still be right for strong graphic shadows, sport, or flash-controlled work."
      ],
      confidence: 78
    };
  }

  if (isProjectQuestion(prompt)) {
    return {
      assumptions: [
        "The Council is deciding whether agents should act on this project, not making edits directly.",
        `Current project risk is ${project.risk}; git state is ${project.git}.`,
        verdict === "REVISE" ? "Project guardrails should be cleared before broad automation." : "Project guardrails are clear enough for a constrained run."
      ],
      sources: [
        `Local project path: ${project.path}`,
        `Agent signals: ${project.agents.length > 0 ? project.agents.join(", ") : "none detected"}`,
        ...firstFiles(project)
      ],
      caveats: [
        "Scanner evidence is lightweight until a live source scan is configured.",
        "Review the working tree before allowing agents to make broad changes."
      ],
      confidence: Math.max(50, Math.min(96, project.confidence))
    };
  }

  return {
    assumptions: [
      "This is a general decision question that can be answered from the Council question.",
      "Project risk should be reported separately unless it changes execution."
    ],
    sources: ["Council question from Drew", `Context packet: ${project.name} project metadata and guardrails`],
    caveats: ["Run a source-backed research sprint if the answer depends on current facts, prices, law, or specs."],
    confidence: 68
  };
}

export function createDemoFlowRun(project: Project, workflow: Workflow, live: boolean, prompt: string): ExampleFlowRun {
  const startedMs = Date.now();
  const councilPrompt = cleanPrompt(prompt);
  const verdict = verdictFor(project, councilPrompt);
  const answer = answerFor(councilPrompt, project, verdict);
  const guardrail = guardrailFor(project, councilPrompt);
  const reportContext = reportContextFor(councilPrompt, project, verdict);
  const riskSentence =
    project.risk === "Clear"
      ? "No project-level risk flags are currently raised."
      : project.risk === "Needs agent file"
        ? "The project needs an agent context file before automation should be trusted."
        : project.risk === "Secret flagged"
          ? "A local secret-shaped file exists and should be reviewed before agent work."
          : "The project needs review before the next agent handoff.";
  const agents = project.agents.length > 0 ? project.agents.join(", ") : "No agent context detected";

  return {
    id: `flow-${startedMs}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    projectId: project.id,
    projectName: project.name,
    prompt: councilPrompt,
    answer,
    guardrail,
    ...reportContext,
    mode: live ? "Live" : "Mock",
    status: "Completed",
    startedMs,
    finishedMs: startedMs + 1400,
    summary: `${live ? "Live flow" : "Mock flow"} answered the Council question. ${guardrail}`,
    verdict,
    seats: [
      {
        seatId: "brief",
        label: "Context packet",
        agent: "System",
        role: "Question + project context",
        status: "done",
        summary: `Prepared the agent handoff packet from the Council question, project metadata, and guardrails without turning it into a second question.`,
        evidence: [`Council question: ${councilPrompt}`, `Project path: ${project.path}`, `Confidence ${project.confidence}`]
      },
      {
        seatId: "researcher",
        label: "Researcher",
        agent: "Researcher",
        role: "Inspect",
        status: "done",
        summary: isLocalAiHardwareQuestion(councilPrompt)
          ? "Compared the practical workflow split: Mac-native local inference versus a dedicated NVIDIA/CUDA AI appliance."
          : isProjectQuestion(councilPrompt)
          ? `Found agent signals: ${agents}. Recent activity is ${project.activity}.`
          : `Looked for answer evidence in the Council question first. The useful signal is about timing and light quality, not repository state.`,
        evidence: isLocalAiHardwareQuestion(councilPrompt)
          ? ["Mac Studio: macOS, Metal, MLX, Ollama, LM Studio", "DGX Spark: NVIDIA CUDA, Linux containers, AI appliance workflow", "Main decision axis: friction versus CUDA compatibility"]
          : isProjectQuestion(councilPrompt)
            ? firstFiles(project)
            : ["Golden hour: sunrise or sunset window", "Blue hour: city and mood shots", "Overcast: soft portrait light"]
      },
      {
        seatId: "critic",
        label: "Critic",
        agent: "Critic",
        role: "Stress test",
        status: "done",
        summary: isLocalAiHardwareQuestion(councilPrompt)
          ? "The failure mode is buying for theoretical maximum capability instead of the software stack you will actually use every day."
          : isProjectQuestion(councilPrompt)
          ? riskSentence
          : "The main caveat is intent: midday can still work for graphic shadows, sport, documentary urgency, or controlled flash.",
        evidence: isLocalAiHardwareQuestion(councilPrompt)
          ? ["Mac Studio is weaker if CUDA-only tooling matters", "DGX Spark adds Linux/NVIDIA admin overhead to a Mac-first setup", "Verify target model sizes and quantization before buying"]
          : isProjectQuestion(councilPrompt)
            ? [`Risk: ${project.risk}`, `Git: ${project.git}`]
            : ["Avoid harsh noon sun for flattering portraits", "Check weather, direction, and subject movement"]
      },
      {
        seatId: "chair",
        label: "Chair",
        agent: "Chair",
        role: "Synthesis",
        status: "done",
        summary: isLocalAiHardwareQuestion(councilPrompt)
          ? "Recommendation: keep your primary Mac clean, add a Mac Studio as the local LLM workstation, and only pick DGX Spark if CUDA compatibility is the reason for the purchase."
          : isProjectQuestion(councilPrompt)
          ? `The next useful move is: ${project.nextTask}. This preserves local-first guardrails while keeping momentum.`
          : "If you can choose only one window, choose late afternoon golden hour because it is easier to plan than sunrise and usually gives warm, directional light.",
        evidence: isLocalAiHardwareQuestion(councilPrompt)
          ? ["Default path: Mac Studio", "Exception path: DGX Spark for CUDA/NVIDIA deployment parity"]
          : isProjectQuestion(councilPrompt) ? [project.notes] : ["Default recommendation: late afternoon golden hour"]
      },
      {
        seatId: "judge",
        label: "Judge",
        agent: "Judge",
        role: "Decision",
        status: "done",
        summary: answer,
        evidence: [
          isLocalAiHardwareQuestion(councilPrompt)
            ? "Decision basis: Mac-first workflow unless CUDA/NVIDIA infrastructure compatibility is decisive"
            : isProjectQuestion(councilPrompt)
              ? `Decision basis: ${riskSentence}`
              : "Decision basis: match light quality to subject and mood"
        ]
      }
    ]
  };
}
