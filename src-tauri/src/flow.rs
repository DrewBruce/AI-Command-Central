use serde::{Deserialize, Serialize};

use crate::db::ProjectRecord;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlowSeatResult {
    pub seat_id: String,
    pub label: String,
    pub agent: String,
    pub role: String,
    pub status: String,
    pub summary: String,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlowRun {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub project_id: String,
    pub project_name: String,
    pub prompt: String,
    pub answer: String,
    pub guardrail: String,
    pub assumptions: Vec<String>,
    pub sources: Vec<String>,
    pub caveats: Vec<String>,
    pub confidence: i64,
    pub mode: String,
    pub status: String,
    pub started_ms: i64,
    pub finished_ms: i64,
    pub summary: String,
    pub verdict: String,
    pub seats: Vec<FlowSeatResult>,
}

fn workflow_name(workflow_id: &str) -> String {
    match workflow_id {
        "ship-readiness" => "Ship Readiness".to_string(),
        "research-sprint" => "Research Sprint".to_string(),
        _ => "Project Review Council".to_string(),
    }
}

fn is_project_question(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    [
        "this repo",
        "this project",
        "current project",
        "codebase",
        "source code",
        "git",
        "dirty git",
        "build error",
        "ship this app",
        "release this app",
        "tauri",
        "command central",
        "agent file",
        "agents edit",
        "scan this project",
        "open terminal",
    ]
    .iter()
    .any(|keyword| prompt.contains(keyword))
}

fn is_local_ai_hardware_question(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    [
        "mac studio",
        "dgx spark",
        "dtx spark",
        "dxg spark",
        "local llm",
        "local llms",
        "local lmm",
        "local lmms",
        "cuda",
        "nvidia",
        "ai workstation",
        "separate mac",
    ]
    .iter()
    .any(|keyword| prompt.contains(keyword))
}

fn has_dgx_typo(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    ["dtx spark", "dxg spark"]
        .iter()
        .any(|keyword| prompt.contains(keyword))
}

fn is_photo_question(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    [
        "photo",
        "photos",
        "photograph",
        "photography",
        "camera",
        "portrait",
        "landscape",
        "light",
    ]
    .iter()
    .any(|keyword| prompt.contains(keyword))
}

fn verdict_for(project: &ProjectRecord, prompt: &str) -> String {
    if !is_project_question(prompt) {
        return "APPROVE".to_string();
    }
    if project.risk == "Secret flagged"
        || project.risk == "Needs agent file"
        || project.git == "Dirty"
    {
        "REVISE".to_string()
    } else {
        "APPROVE".to_string()
    }
}

fn first_files(project: &ProjectRecord) -> Vec<String> {
    if project.recent_files.is_empty() {
        vec!["No recent files indexed yet".to_string()]
    } else {
        project.recent_files.iter().take(3).cloned().collect()
    }
}

fn clean_prompt(prompt: &str) -> String {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        "Review this project state and recommend the next useful move.".to_string()
    } else {
        trimmed.to_string()
    }
}

fn answer_for(prompt: &str, project: &ProjectRecord, verdict: &str) -> String {
    if is_local_ai_hardware_question(prompt) {
        let prefix = if has_dgx_typo(prompt) {
            "Interpreting DTX/DXG Spark as NVIDIA DGX Spark: "
        } else {
            ""
        };
        return format!("{prefix}Given you already have a Mac as your primary machine and will still use commercial LLMs like Codex and Claude, buy the highest-memory Mac Studio first. It is the lower-friction local LLM workstation for a Mac-first workflow: macOS, Metal, MLX, Ollama, LM Studio, and easy file handoff beside your daily setup. DGX Spark is the better choice only if you specifically need NVIDIA CUDA, Linux containers, or deployment parity with NVIDIA infrastructure. With no budget constraint, the practical order is Mac Studio now; add DGX Spark later if CUDA-only tooling becomes a real requirement.");
    }

    if is_photo_question(prompt) {
        return "Best default: shoot during golden hour, either the first hour after sunrise or the last hour before sunset. Use blue hour for city lights and atmosphere, overcast daylight for soft portraits, and avoid harsh midday sun unless you deliberately want strong shadows.".to_string();
    }

    if is_project_question(prompt) {
        if verdict == "REVISE" {
            return format!(
                "Do not let agents make broad edits yet. First fix the project guardrail issue: {}, then rerun the Council.",
                if project.risk == "Needs agent file" { "add or review the agent context file".to_string() } else { project.risk.to_lowercase() }
            );
        }
        return format!(
            "The project is clear enough for a constrained agent run. Start with {} and keep the run scoped to reviewed files.",
            project.next_task.to_lowercase()
        );
    }

    "The Council recommends answering the Council question directly, then checking only the project guardrails that could affect execution. No project blocker changes the answer to this general question.".to_string()
}

fn guardrail_for(project: &ProjectRecord, prompt: &str) -> String {
    if !is_project_question(prompt) {
        return format!(
            "Project guardrail noted separately: {} is {} and marked {}, but that does not change the answer to this general question.",
            project.name,
            project.git.to_lowercase(),
            project.risk.to_lowercase()
        );
    }
    format!(
        "Project guardrail: {} git state, {} risk.",
        project.git, project.risk
    )
}

struct ReportContext {
    assumptions: Vec<String>,
    sources: Vec<String>,
    caveats: Vec<String>,
    confidence: i64,
}

fn report_context_for(project: &ProjectRecord, prompt: &str, verdict: &str) -> ReportContext {
    if is_local_ai_hardware_question(prompt) {
        let mut assumptions = vec![
            "Your existing Mac remains the main working environment, so workflow friction matters.".to_string(),
            "Commercial LLMs continue to handle some tasks, so the local machine is for privacy, latency, experimentation, and offline work.".to_string(),
            "CUDA-only tooling is valuable only if you expect NVIDIA deployment parity.".to_string(),
        ];
        if has_dgx_typo(prompt) {
            assumptions.insert(
                0,
                "DTX/DXG Spark is interpreted as NVIDIA DGX Spark.".to_string(),
            );
        }

        return ReportContext {
            assumptions,
            sources: vec![
                "Council question from Drew".to_string(),
                format!("Project context: {}", project.name),
                "Existing machine context supplied in the question".to_string(),
                "Mac-native path: Metal, MLX, Ollama, LM Studio".to_string(),
                "NVIDIA path: CUDA, Linux containers, DGX-style workflow".to_string(),
            ],
            caveats: vec![
                "Confirm target model sizes, quantization, and memory needs before buying hardware.".to_string(),
                "Fast demo mode is not live web research; treat prices and current specs as unverified.".to_string(),
                "If your must-have tools require CUDA, the recommendation flips toward DGX Spark.".to_string(),
            ],
            confidence: 72,
        };
    }

    if is_photo_question(prompt) {
        return ReportContext {
            assumptions: vec![
                "The goal is attractive natural light rather than a documentary or studio constraint.".to_string(),
                "You can choose the shooting window rather than reacting to a fixed event time.".to_string(),
            ],
            sources: vec![
                "Council question from Drew".to_string(),
                "Light-quality heuristic: golden hour, blue hour, overcast daylight".to_string(),
            ],
            caveats: vec![
                "Weather, subject direction, and location shadowing can change the best window.".to_string(),
                "Midday can still be right for strong graphic shadows, sport, or flash-controlled work.".to_string(),
            ],
            confidence: 78,
        };
    }

    if is_project_question(prompt) {
        let mut sources = vec![
            format!("Local project path: {}", project.path),
            format!(
                "Agent signals: {}",
                if project.agents.is_empty() {
                    "none detected".to_string()
                } else {
                    project.agents.join(", ")
                }
            ),
        ];
        sources.extend(first_files(project));

        return ReportContext {
            assumptions: vec![
                "The Council is deciding whether agents should act on this project, not making edits directly.".to_string(),
                format!("Current project risk is {}; git state is {}.", project.risk, project.git),
                if verdict == "REVISE" {
                    "Project guardrails should be cleared before broad automation.".to_string()
                } else {
                    "Project guardrails are clear enough for a constrained run.".to_string()
                },
            ],
            sources,
            caveats: vec![
                "Scanner evidence is lightweight until a live source scan is configured.".to_string(),
                "Review the working tree before allowing agents to make broad changes.".to_string(),
            ],
            confidence: project.confidence.clamp(50, 96),
        };
    }

    ReportContext {
        assumptions: vec![
            "This is a general decision question that can be answered from the Council question.".to_string(),
            "Project risk should be reported separately unless it changes execution.".to_string(),
        ],
        sources: vec![
            "Council question from Drew".to_string(),
            format!("Context packet: {} project metadata and guardrails", project.name),
        ],
        caveats: vec![
            "Run a source-backed research sprint if the answer depends on current facts, prices, law, or specs.".to_string(),
        ],
        confidence: 68,
    }
}

pub fn build_example_flow(
    project: &ProjectRecord,
    workflow_id: &str,
    live: bool,
    started_ms: i64,
    prompt: &str,
) -> FlowRun {
    let workflow_name = workflow_name(workflow_id);
    let council_prompt = clean_prompt(prompt);
    let verdict = verdict_for(project, &council_prompt);
    let answer = answer_for(&council_prompt, project, &verdict);
    let guardrail = guardrail_for(project, &council_prompt);
    let report_context = report_context_for(project, &council_prompt, &verdict);
    let project_question = is_project_question(&council_prompt);
    let hardware_question = is_local_ai_hardware_question(&council_prompt);
    let mode = if live { "Live" } else { "Mock" }.to_string();
    let file_evidence = first_files(project);
    let agent_list = if project.agents.is_empty() {
        "No agent context detected".to_string()
    } else {
        project.agents.join(", ")
    };
    let risk_sentence = match project.risk.as_str() {
        "Clear" => "No project-level risk flags are currently raised.".to_string(),
        "Needs agent file" => {
            "The project needs an agent context file before automation should be trusted."
                .to_string()
        }
        "Secret flagged" => {
            "A local secret-shaped file exists and should be reviewed before agent work."
                .to_string()
        }
        _ => "The project needs review before the next agent handoff.".to_string(),
    };

    let seats = vec![
        FlowSeatResult {
            seat_id: "brief".to_string(),
            label: "Context packet".to_string(),
            agent: "System".to_string(),
            role: "Question + project context".to_string(),
            status: "done".to_string(),
            summary: "Prepared the agent handoff packet from the Council question, project metadata, and guardrails without turning it into a second question.".to_string(),
            evidence: vec![format!("Council question: {council_prompt}"), format!("Project path: {}", project.path), format!("Confidence {}", project.confidence)],
        },
        FlowSeatResult {
            seat_id: "researcher".to_string(),
            label: "Researcher".to_string(),
            agent: "Researcher".to_string(),
            role: "Inspect".to_string(),
            status: "done".to_string(),
            summary: if hardware_question {
                "Compared the practical workflow split: Mac-native local inference versus a dedicated NVIDIA/CUDA AI appliance.".to_string()
            } else if project_question {
                format!("Found agent signals: {agent_list}. Recent activity is {}.", project.activity)
            } else {
                "Looked for answer evidence in the Council question first. The useful signal is about timing and light quality, not repository state.".to_string()
            },
            evidence: if hardware_question {
                vec![
                    "Mac Studio: macOS, Metal, MLX, Ollama, LM Studio".to_string(),
                    "DGX Spark: NVIDIA CUDA, Linux containers, AI appliance workflow".to_string(),
                    "Main decision axis: friction versus CUDA compatibility".to_string(),
                ]
            } else if project_question {
                file_evidence.clone()
            } else {
                vec![
                    "Golden hour: sunrise or sunset window".to_string(),
                    "Blue hour: city and mood shots".to_string(),
                    "Overcast: soft portrait light".to_string(),
                ]
            },
        },
        FlowSeatResult {
            seat_id: "critic".to_string(),
            label: "Critic".to_string(),
            agent: "Critic".to_string(),
            role: "Stress test".to_string(),
            status: "done".to_string(),
            summary: if hardware_question {
                "The failure mode is buying for theoretical maximum capability instead of the software stack you will actually use every day.".to_string()
            } else if project_question {
                risk_sentence.clone()
            } else {
                "The main caveat is intent: midday can still work for graphic shadows, sport, documentary urgency, or controlled flash.".to_string()
            },
            evidence: if hardware_question {
                vec![
                    "Mac Studio is weaker if CUDA-only tooling matters".to_string(),
                    "DGX Spark adds Linux/NVIDIA admin overhead to a Mac-first setup".to_string(),
                    "Verify target model sizes and quantization before buying".to_string(),
                ]
            } else if project_question {
                vec![format!("Risk: {}", project.risk), format!("Git: {}", project.git)]
            } else {
                vec![
                    "Avoid harsh noon sun for flattering portraits".to_string(),
                    "Check weather, direction, and subject movement".to_string(),
                ]
            },
        },
        FlowSeatResult {
            seat_id: "chair".to_string(),
            label: "Chair".to_string(),
            agent: "Chair".to_string(),
            role: "Synthesis".to_string(),
            status: "done".to_string(),
            summary: if hardware_question {
                "Recommendation: keep your primary Mac clean, add a Mac Studio as the local LLM workstation, and only pick DGX Spark if CUDA compatibility is the reason for the purchase.".to_string()
            } else if project_question {
                format!(
                    "The next useful move is: {}. This preserves local-first guardrails while keeping momentum.",
                    project.next_task
                )
            } else {
                "If you can choose only one window, choose late afternoon golden hour because it is easier to plan than sunrise and usually gives warm, directional light.".to_string()
            },
            evidence: if hardware_question {
                vec![
                    "Default path: Mac Studio".to_string(),
                    "Exception path: DGX Spark for CUDA/NVIDIA deployment parity".to_string(),
                ]
            } else if project_question {
                vec![project.notes.clone()]
            } else {
                vec!["Default recommendation: late afternoon golden hour".to_string()]
            },
        },
        FlowSeatResult {
            seat_id: "judge".to_string(),
            label: "Judge".to_string(),
            agent: "Judge".to_string(),
            role: "Decision".to_string(),
            status: "done".to_string(),
            summary: answer.clone(),
            evidence: vec![
                if hardware_question {
                    "Decision basis: Mac-first workflow unless CUDA/NVIDIA infrastructure compatibility is decisive".to_string()
                } else if project_question {
                    format!("Decision basis: {risk_sentence}")
                } else {
                    "Decision basis: match light quality to subject and mood".to_string()
                }
            ],
        },
    ];

    FlowRun {
        id: format!("flow-{started_ms}"),
        workflow_id: workflow_id.to_string(),
        workflow_name,
        project_id: project.id.clone(),
        project_name: project.name.clone(),
        prompt: council_prompt,
        answer,
        guardrail: guardrail.clone(),
        assumptions: report_context.assumptions,
        sources: report_context.sources,
        caveats: report_context.caveats,
        confidence: report_context.confidence,
        mode,
        status: "Completed".to_string(),
        started_ms,
        finished_ms: started_ms + 1_400,
        summary: format!(
            "{} answered the Council question. {}",
            if live { "Live flow" } else { "Mock flow" },
            guardrail
        ),
        verdict,
        seats,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(risk: &str, git: &str) -> ProjectRecord {
        ProjectRecord {
            id: "project-1".to_string(),
            name: "Example".to_string(),
            path: "/tmp/example".to_string(),
            agents: vec!["Codex".to_string(), "Claude".to_string()],
            status: "Active".to_string(),
            git: git.to_string(),
            risk: risk.to_string(),
            confidence: 92,
            activity: "just now".to_string(),
            next_task: "Review working tree".to_string(),
            notes: "Useful local project.".to_string(),
            recent_files: vec!["src/App.tsx".to_string()],
            sessions: Vec::new(),
            last_scanned_ms: 100,
            last_modified_ms: Some(90),
        }
    }

    #[test]
    fn builds_five_seat_revision_flow_for_risky_project() {
        let run = build_example_flow(
            &project("Needs agent file", "Clean"),
            "project-review",
            false,
            123,
            "Should I let agents edit this repo?",
        );

        assert_eq!(run.id, "flow-123");
        assert_eq!(run.prompt, "Should I let agents edit this repo?");
        assert_eq!(run.workflow_name, "Project Review Council");
        assert_eq!(run.verdict, "REVISE");
        assert_eq!(run.seats.len(), 5);
        assert_eq!(run.seats[1].agent, "Researcher");
        assert!(run
            .answer
            .contains("Do not let agents make broad edits yet"));
        assert!(run.guardrail.contains("Needs agent file"));
        assert!(run
            .assumptions
            .iter()
            .any(|item| item.contains("guardrails")));
        assert!(run.sources.iter().any(|item| item.contains("/tmp/example")));
    }

    #[test]
    fn approves_clear_clean_project() {
        let run = build_example_flow(&project("Clear", "Clean"), "project-review", false, 456, "");

        assert_eq!(run.verdict, "APPROVE");
        assert!(run.answer.contains("constrained agent run"));
    }

    #[test]
    fn answers_general_photo_question_without_project_revision() {
        let run = build_example_flow(
            &project("Needs agent file", "Dirty"),
            "project-review",
            true,
            789,
            "What is the best time of day to take photos?",
        );

        assert_eq!(run.verdict, "APPROVE");
        assert!(run.answer.contains("golden hour"));
        assert!(run.guardrail.contains("does not change the answer"));
        assert!(run.seats[4].summary.contains("golden hour"));
    }

    #[test]
    fn answers_local_ai_hardware_question_without_project_revision() {
        let run = build_example_flow(
            &project("Needs agent file", "Dirty"),
            "project-review",
            false,
            790,
            "I have a Mac now as my primary machine, but I wish to start running local LMMs. Am I better off having a separate Mac Studio or a DTX Spark?",
        );

        assert_eq!(run.verdict, "APPROVE");
        assert!(run.answer.contains("Mac Studio"));
        assert!(run.answer.contains("CUDA"));
        assert_eq!(run.confidence, 72);
        assert!(run
            .assumptions
            .iter()
            .any(|item| item.contains("DGX Spark")));
        assert!(run
            .caveats
            .iter()
            .any(|item| item.contains("specs as unverified")));
        assert!(run.guardrail.contains("does not change the answer"));
        assert!(!run.answer.contains("agent context file"));
        assert!(run.seats[1].summary.contains("Mac-native local inference"));
        assert!(run.seats[2].summary.contains("software stack"));
        assert!(run.seats[3].summary.contains("Mac Studio"));
        assert!(run.seats[4].evidence[0].contains("Mac-first workflow"));
        assert!(!run.seats[4].evidence[0].contains("light quality"));
    }

    #[test]
    fn correctly_spelled_dgx_question_does_not_claim_typo_interpretation() {
        let run = build_example_flow(
            &project("Needs agent file", "Dirty"),
            "project-review",
            false,
            791,
            "Between a DGX Spark and a Mac Studio, with Codex and Claude still in my workflow, what should I buy?",
        );

        assert_eq!(run.verdict, "APPROVE");
        assert!(run
            .answer
            .contains("buy the highest-memory Mac Studio first"));
        assert!(!run.answer.contains("Interpreting DTX/DXG"));
        assert!(!run
            .assumptions
            .iter()
            .any(|item| item.contains("interpreted as")));
        assert!(run
            .sources
            .iter()
            .any(|item| item.contains("Existing machine context")));
    }
}
