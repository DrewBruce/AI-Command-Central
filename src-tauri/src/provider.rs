use std::{process::Command, time::Duration};

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::db::ProjectRecord;

const EXTERNAL_KEYCHAIN_SERVICE: &str = "com.andrewbruce.ai-command-central.external-api-key";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub mode: String,
    pub local_base_url: String,
    pub local_model: String,
    pub external_provider: String,
    pub external_model: String,
    pub api_key_stored: bool,
}

#[derive(Debug, Clone)]
pub struct ProviderAnswer {
    pub content: String,
    pub provider_label: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEndpointStatus {
    pub available: bool,
    pub model_installed: bool,
    pub label: String,
    pub detail: String,
    pub checked_url: String,
    pub models: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct ChatChoiceMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    #[serde(default)]
    data: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FmHealthResponse {
    #[serde(default)]
    models: Vec<FmHealthModel>,
}

#[derive(Debug, Deserialize)]
struct FmHealthModel {
    name: String,
    available: bool,
    reason: Option<String>,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            mode: "demo".to_string(),
            local_base_url: "http://127.0.0.1:11434/v1".to_string(),
            local_model: "gemma4:26b".to_string(),
            external_provider: "OpenAI".to_string(),
            external_model: "gpt-4.1-mini".to_string(),
            api_key_stored: false,
        }
    }
}

pub fn normalize_config(config: ProviderConfig) -> ProviderConfig {
    let defaults = ProviderConfig::default();
    let mode = match config.mode.trim() {
        "local" => "local",
        "external" => "external",
        _ => "demo",
    };

    ProviderConfig {
        mode: mode.to_string(),
        local_base_url: default_if_empty(config.local_base_url, defaults.local_base_url),
        local_model: default_if_empty(config.local_model, defaults.local_model),
        external_provider: default_if_empty(config.external_provider, defaults.external_provider),
        external_model: default_if_empty(config.external_model, defaults.external_model),
        api_key_stored: config.api_key_stored,
    }
}

pub fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

pub fn ollama_root_url(base_url: &str) -> String {
    let mut trimmed = base_url.trim().trim_end_matches('/').to_string();
    let suffixes = [
        "/v1/chat/completions",
        "/chat/completions",
        "/v1/models",
        "/models",
        "/v1",
        "/api",
    ];

    loop {
        let mut stripped = false;
        for suffix in suffixes {
            if let Some(prefix) = trimmed.strip_suffix(suffix) {
                trimmed = prefix.trim_end_matches('/').to_string();
                stripped = true;
                break;
            }
        }
        if !stripped {
            break;
        }
    }

    if trimmed.is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else {
        trimmed
    }
}

pub fn ollama_tags_url(base_url: &str) -> String {
    format!("{}/api/tags", ollama_root_url(base_url))
}

pub fn openai_models_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/models") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    }
}

pub fn normalized_external_provider(provider: &str) -> String {
    match provider.trim().to_lowercase().as_str() {
        "openai" => "OpenAI".to_string(),
        other if other.is_empty() => "OpenAI".to_string(),
        _ => provider.trim().to_string(),
    }
}

pub fn external_chat_completions_url(provider: &str) -> Option<String> {
    match normalized_external_provider(provider).as_str() {
        "OpenAI" => Some("https://api.openai.com/v1/chat/completions".to_string()),
        _ => None,
    }
}

fn external_models_url(provider: &str) -> Option<String> {
    match normalized_external_provider(provider).as_str() {
        "OpenAI" => Some("https://api.openai.com/v1/models".to_string()),
        _ => None,
    }
}

fn external_provider_label(provider: &str) -> String {
    match normalized_external_provider(provider).as_str() {
        "OpenAI" => "OpenAI API".to_string(),
        other => format!("{other} API"),
    }
}

pub fn is_apple_foundation_models_endpoint(base_url: &str, model: &str) -> bool {
    let root = ollama_root_url(base_url).to_lowercase();
    let model = model.trim().to_lowercase();
    root.contains(":1976")
        || root.contains("foundation")
        || (!is_ollama_endpoint(base_url) && (model == "system" || model == "pcc"))
}

fn is_ollama_endpoint(base_url: &str) -> bool {
    let root = ollama_root_url(base_url).to_lowercase();
    root.contains("11434") || root.contains("ollama")
}

fn fm_health_url(base_url: &str) -> String {
    format!("{}/health", ollama_root_url(base_url))
}

pub async fn check_local_provider_status(config: &ProviderConfig) -> ProviderEndpointStatus {
    let config = normalize_config(config.clone());
    if is_apple_foundation_models_endpoint(&config.local_base_url, &config.local_model) {
        check_apple_foundation_models_status(&config).await
    } else {
        check_ollama_status(&config).await
    }
}

pub async fn check_provider_status(config: &ProviderConfig) -> ProviderEndpointStatus {
    let config = normalize_config(config.clone());
    match config.mode.as_str() {
        "local" => check_local_provider_status(&config).await,
        "external" => check_external_provider_status(&config).await,
        _ => ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Demo mode selected".to_string(),
            detail: "Choose a local endpoint or external API before checking provider status."
                .to_string(),
            checked_url: String::new(),
            models: vec![],
        },
    }
}

async fn check_external_provider_status(config: &ProviderConfig) -> ProviderEndpointStatus {
    let provider = normalized_external_provider(&config.external_provider);
    let checked_url = external_chat_completions_url(&provider).unwrap_or_default();
    let models_url = external_models_url(&provider);
    let model = config.external_model.trim().to_string();

    if checked_url.is_empty() || models_url.is_none() {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "External provider unsupported".to_string(),
            detail: format!(
                "{provider} is not wired yet. OpenAI is the supported external provider in this build."
            ),
            checked_url,
            models: vec![],
        };
    }

    if model.is_empty() {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "External model name missing".to_string(),
            detail: "Add an OpenAI model name before checking the external provider.".to_string(),
            checked_url,
            models: vec![],
        };
    }

    if !config.api_key_stored {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "External API key missing".to_string(),
            detail: format!(
                "Store a {provider} API key in macOS Keychain before checking or running external calls."
            ),
            checked_url,
            models: vec![],
        };
    }

    let api_key = match read_external_api_key(&provider) {
        Ok(api_key) => api_key,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "External API key unavailable".to_string(),
                detail: error,
                checked_url,
                models: vec![],
            }
        }
    };

    let model_list_url = models_url.unwrap();
    let client = match Client::builder().timeout(Duration::from_secs(10)).build() {
        Ok(client) => client,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "External provider check failed".to_string(),
                detail: format!("Could not prepare the external HTTP client: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    let response = match client
        .get(&model_list_url)
        .bearer_auth(api_key)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "External provider not reachable".to_string(),
                detail: format!("No {provider} response at {model_list_url}: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.lines().next().unwrap_or("No response body");
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "External provider not ready".to_string(),
            detail: format!("{provider} model check returned {status}: {detail}"),
            checked_url,
            models: vec![],
        };
    }

    let model_response = match response.json::<OpenAiModelsResponse>().await {
        Ok(model_response) => model_response,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "External model response unreadable".to_string(),
                detail: format!("{provider} /v1/models was not readable JSON: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };
    let mut models: Vec<String> = model_response
        .data
        .into_iter()
        .filter_map(|entry| entry.id)
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    models.sort_by_key(|name| name.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    let model_installed = models.iter().any(|name| name.eq_ignore_ascii_case(&model));
    let label = if model_installed {
        format!("{provider} API ready")
    } else {
        format!("{provider} model not found")
    };
    let detail = if model_installed {
        format!("{provider} responded and {model} is listed.")
    } else if models.is_empty() {
        format!("{provider} responded, but no models were listed for this key.")
    } else {
        format!("{provider} responded, but {model} was not listed for this key.")
    };

    ProviderEndpointStatus {
        available: true,
        model_installed,
        label,
        detail,
        checked_url,
        models,
    }
}

async fn check_apple_foundation_models_status(config: &ProviderConfig) -> ProviderEndpointStatus {
    let checked_url = fm_health_url(&config.local_base_url);
    let model = config.local_model.trim().to_string();

    if config.mode != "local" {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Local provider not selected".to_string(),
            detail: "Choose Local endpoint before checking Apple Foundation Models.".to_string(),
            checked_url,
            models: vec![],
        };
    }

    if model.is_empty() {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Model name missing".to_string(),
            detail: "Use system for Apple's on-device Foundation Model or pcc when available."
                .to_string(),
            checked_url,
            models: vec![],
        };
    }

    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(client) => client,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Apple model check failed".to_string(),
                detail: format!("Could not prepare the local HTTP client: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    let response = match client.get(&checked_url).send().await {
        Ok(response) => response,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Apple Foundation Models not reachable".to_string(),
                detail: format!(
                    "No fm serve response at {checked_url}: {error}. Start it with: fm serve --host 127.0.0.1 --port 1976"
                ),
                checked_url,
                models: vec![],
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Apple Foundation Models not ready".to_string(),
            detail: format!("fm serve returned {status} at {checked_url}."),
            checked_url,
            models: vec![],
        };
    }

    let health = match response.json::<FmHealthResponse>().await {
        Ok(health) => health,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Apple model response unreadable".to_string(),
                detail: format!("fm serve responded, but /health was not readable JSON: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    let mut models: Vec<String> = health
        .models
        .iter()
        .map(|entry| entry.name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    models.sort_by_key(|name| name.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));

    let selected = health
        .models
        .iter()
        .find(|entry| entry.name.eq_ignore_ascii_case(&model));
    let model_installed = selected.map(|entry| entry.available).unwrap_or(false);
    let label = if model_installed {
        "Apple Foundation Models ready"
    } else if selected.is_some() {
        "Apple model unavailable"
    } else {
        "Apple model missing"
    };
    let detail = if model_installed {
        format!("fm serve is running and the {model} model is available.")
    } else if let Some(entry) = selected {
        let reason = entry
            .reason
            .as_deref()
            .unwrap_or("The selected Apple model is not available in this context.");
        format!("fm serve is running, but {model} is unavailable: {reason}")
    } else if models.is_empty() {
        format!("fm serve is running, but no Apple Foundation Models were listed.")
    } else {
        format!(
            "fm serve is running, but {model} was not listed. Available models: {}.",
            models.join(", ")
        )
    };

    ProviderEndpointStatus {
        available: true,
        model_installed,
        label: label.to_string(),
        detail,
        checked_url,
        models,
    }
}

async fn check_ollama_status(config: &ProviderConfig) -> ProviderEndpointStatus {
    let config = normalize_config(config.clone());
    let checked_url = ollama_tags_url(&config.local_base_url);
    let model = config.local_model.trim().to_string();

    if config.mode != "local" {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Local provider not selected".to_string(),
            detail: "Choose Local endpoint before checking Ollama.".to_string(),
            checked_url,
            models: vec![],
        };
    }

    if model.is_empty() {
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Model name missing".to_string(),
            detail: "Add an Ollama model name such as gemma4:26b before checking.".to_string(),
            checked_url,
            models: vec![],
        };
    }

    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(client) => client,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Ollama check failed".to_string(),
                detail: format!("Could not prepare the local HTTP client: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    let response = match client.get(&checked_url).send().await {
        Ok(response) => response,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Ollama not reachable".to_string(),
                detail: format!(
                    "No Ollama response at {checked_url}: {error}. Start Ollama, then run: ollama pull {model}"
                ),
                checked_url,
                models: vec![],
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        return ProviderEndpointStatus {
            available: false,
            model_installed: false,
            label: "Ollama not ready".to_string(),
            detail: format!("Ollama status check returned {status} at {checked_url}."),
            checked_url,
            models: vec![],
        };
    }

    let tag_response = match response.json::<OllamaTagsResponse>().await {
        Ok(tag_response) => tag_response,
        Err(error) => {
            return ProviderEndpointStatus {
                available: false,
                model_installed: false,
                label: "Ollama response unreadable".to_string(),
                detail: format!("Ollama responded, but /api/tags was not readable JSON: {error}"),
                checked_url,
                models: vec![],
            }
        }
    };

    let mut models: Vec<String> = tag_response
        .models
        .into_iter()
        .filter_map(|entry| entry.name.or(entry.model))
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    models.sort_by_key(|name| name.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));

    let model_installed = models.iter().any(|name| name.eq_ignore_ascii_case(&model));
    let label = if model_installed {
        "Ollama ready"
    } else {
        "Ollama model missing"
    };
    let detail = if model_installed {
        format!("Ollama is running and {model} is installed.")
    } else if models.is_empty() {
        format!("Ollama is running, but no models are installed yet. Run: ollama pull {model}")
    } else {
        format!("Ollama is running, but {model} is not installed. Run: ollama pull {model}")
    };

    ProviderEndpointStatus {
        available: true,
        model_installed,
        label: label.to_string(),
        detail,
        checked_url,
        models,
    }
}

pub async fn list_local_models(config: &ProviderConfig) -> Result<Vec<String>, String> {
    let config = normalize_config(config.clone());
    if is_apple_foundation_models_endpoint(&config.local_base_url, &config.local_model) {
        return list_apple_foundation_models(&config).await;
    }

    list_ollama_models(&config).await
}

async fn list_apple_foundation_models(config: &ProviderConfig) -> Result<Vec<String>, String> {
    let checked_url = openai_models_url(&config.local_base_url);
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&checked_url)
        .send()
        .await
        .map_err(|error| format!("No fm serve response at {checked_url}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!(
            "Apple Foundation Models list returned {status} at {checked_url}."
        ));
    }

    let model_response = response
        .json::<OpenAiModelsResponse>()
        .await
        .map_err(|error| format!("fm serve /v1/models was not readable JSON: {error}"))?;
    let mut models: Vec<String> = model_response
        .data
        .into_iter()
        .filter_map(|entry| entry.id)
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    models.sort_by_key(|name| name.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    Ok(models)
}

async fn list_ollama_models(config: &ProviderConfig) -> Result<Vec<String>, String> {
    let checked_url = ollama_tags_url(&config.local_base_url);
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&checked_url)
        .send()
        .await
        .map_err(|error| format!("No Ollama response at {checked_url}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!(
            "Ollama model list returned {status} at {checked_url}."
        ));
    }

    let tag_response = response
        .json::<OllamaTagsResponse>()
        .await
        .map_err(|error| format!("Ollama /api/tags was not readable JSON: {error}"))?;
    let mut models: Vec<String> = tag_response
        .models
        .into_iter()
        .filter_map(|entry| entry.name.or(entry.model))
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    models.sort_by_key(|name| name.to_lowercase());
    models.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    Ok(models)
}

pub async fn ask_provider(
    config: &ProviderConfig,
    project: &ProjectRecord,
    prompt: &str,
) -> Result<ProviderAnswer, String> {
    let config = normalize_config(config.clone());
    match config.mode.as_str() {
        "local" => ask_local_provider(&config, project, prompt).await,
        "external" => ask_external_provider(&config, project, prompt).await,
        _ => Err(
            "Live runs need a configured provider. Settings is currently in demo mode.".to_string(),
        ),
    }
}

pub async fn ask_provider_with_prompt(
    config: &ProviderConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<ProviderAnswer, String> {
    let config = normalize_config(config.clone());
    match config.mode.as_str() {
        "local" => ask_local_provider_with_prompt(&config, system_prompt, user_prompt).await,
        "external" => ask_external_provider_with_prompt(&config, system_prompt, user_prompt).await,
        _ => Err(
            "Live runs need a configured provider. Settings is currently in demo mode.".to_string(),
        ),
    }
}

async fn ask_external_provider(
    config: &ProviderConfig,
    project: &ProjectRecord,
    prompt: &str,
) -> Result<ProviderAnswer, String> {
    ask_external_provider_with_prompt(
        config,
        "You are the Judge seat in Project Review Council. Give a concise decision-grade answer. Start with a direct recommendation, then cover why, caveats, and next action. Do not claim to inspect files beyond the context provided.",
        &council_context(project, prompt),
    )
    .await
}

async fn ask_local_provider(
    config: &ProviderConfig,
    project: &ProjectRecord,
    prompt: &str,
) -> Result<ProviderAnswer, String> {
    ask_local_provider_with_prompt(
        config,
        "You are the Judge seat in Project Review Council. Give a concise decision-grade answer. Start with a direct recommendation, then cover why, caveats, and next action. Do not claim to inspect files beyond the context provided.",
        &council_context(project, prompt),
    )
    .await
}

async fn ask_local_provider_with_prompt(
    config: &ProviderConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<ProviderAnswer, String> {
    let base_url = config.local_base_url.trim();
    let model = config.local_model.trim();
    if base_url.is_empty() || model.is_empty() {
        return Err("Local provider needs both a base URL and model name.".to_string());
    }

    let request = ChatCompletionRequest {
        model: model.to_string(),
        temperature: 0.2,
        stream: false,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            },
        ],
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let url = chat_completions_url(base_url);
    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("Local provider did not respond at {url}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.lines().next().unwrap_or("No response body");
        return Err(format!("Local provider returned {status}: {detail}"));
    }

    let body = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| {
            format!("Local provider response was not OpenAI-compatible JSON: {error}")
        })?;
    let content = answer_content_from_response(body, "Local provider")?;

    Ok(ProviderAnswer {
        content,
        provider_label: local_provider_label(base_url),
        model: model.to_string(),
    })
}

async fn ask_external_provider_with_prompt(
    config: &ProviderConfig,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<ProviderAnswer, String> {
    let provider = normalized_external_provider(&config.external_provider);
    let model = config.external_model.trim();
    let url = external_chat_completions_url(&provider)
        .ok_or_else(|| format!("{provider} is not wired for external API calls yet."))?;

    if model.is_empty() {
        return Err("External provider needs a model name.".to_string());
    }

    if !config.api_key_stored {
        return Err(format!("External API key is not stored for {provider}."));
    }

    let api_key = read_external_api_key(&provider)?;
    let request = ChatCompletionRequest {
        model: model.to_string(),
        temperature: 0.2,
        stream: false,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            },
        ],
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("{provider} API did not respond at {url}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.lines().next().unwrap_or("No response body");
        return Err(format!("{provider} API returned {status}: {detail}"));
    }

    let body = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| {
            format!("{provider} API response was not OpenAI-compatible JSON: {error}")
        })?;
    let content = answer_content_from_response(body, &format!("{provider} API"))?;

    Ok(ProviderAnswer {
        content,
        provider_label: external_provider_label(&provider),
        model: model.to_string(),
    })
}

fn council_context(project: &ProjectRecord, prompt: &str) -> String {
    format!(
        "Council question:\n{prompt}\n\nProject context:\n- Name: {name}\n- Path: {path}\n- Git state: {git}\n- Risk: {risk}\n- Next task: {next_task}\n- Recent files: {recent_files}\n\nReturn a practical answer for Drew.",
        prompt = prompt,
        name = project.name,
        path = project.path,
        git = project.git,
        risk = project.risk,
        next_task = project.next_task,
        recent_files = project.recent_files.join(", ")
    )
}

fn default_if_empty(value: String, fallback: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed.to_string()
    }
}

fn local_provider_label(base_url: &str) -> String {
    let root = ollama_root_url(base_url).to_lowercase();
    if root.contains("11434") || root.contains("ollama") {
        "Ollama OpenAI-compatible endpoint".to_string()
    } else if root.contains(":1976") || root.contains("foundation") || root.contains("fm") {
        "Apple Foundation Models endpoint".to_string()
    } else {
        "Local OpenAI-compatible endpoint".to_string()
    }
}

fn answer_content_from_response(
    body: ChatCompletionResponse,
    provider_label: &str,
) -> Result<String, String> {
    body.choices
        .first()
        .map(|choice| choice.message.content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| format!("{provider_label} returned no answer text."))
}

pub fn store_external_api_key(provider: &str, api_key: &str) -> Result<(), String> {
    let provider = normalized_external_provider(provider);
    if external_chat_completions_url(&provider).is_none() {
        return Err(format!(
            "{provider} is not wired for external API calls yet."
        ));
    }

    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("External API key cannot be empty.".to_string());
    }

    let output = Command::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-a",
            &provider,
            "-s",
            EXTERNAL_KEYCHAIN_SERVICE,
            "-w",
            api_key,
            "-U",
        ])
        .output()
        .map_err(|error| format!("Could not access macOS Keychain: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Could not store {provider} API key in macOS Keychain: {}",
            command_error_detail(&output.stderr)
        ))
    }
}

pub fn clear_external_api_key(provider: &str) -> Result<(), String> {
    let provider = normalized_external_provider(provider);
    if external_chat_completions_url(&provider).is_none() {
        return Err(format!(
            "{provider} is not wired for external API calls yet."
        ));
    }

    let output = Command::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-a",
            &provider,
            "-s",
            EXTERNAL_KEYCHAIN_SERVICE,
        ])
        .output()
        .map_err(|error| format!("Could not access macOS Keychain: {error}"))?;

    if output.status.success()
        || command_error_detail(&output.stderr).contains("could not be found")
    {
        Ok(())
    } else {
        Err(format!(
            "Could not clear {provider} API key from macOS Keychain: {}",
            command_error_detail(&output.stderr)
        ))
    }
}

fn read_external_api_key(provider: &str) -> Result<String, String> {
    let provider = normalized_external_provider(provider);
    if external_chat_completions_url(&provider).is_none() {
        return Err(format!(
            "{provider} is not wired for external API calls yet."
        ));
    }

    let output = Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-a",
            &provider,
            "-s",
            EXTERNAL_KEYCHAIN_SERVICE,
            "-w",
        ])
        .output()
        .map_err(|error| format!("Could not access macOS Keychain: {error}"))?;

    if !output.status.success() {
        return Err(format!("External API key is not stored for {provider}."));
    }

    let api_key = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if api_key.is_empty() {
        Err(format!("External API key is empty for {provider}."))
    } else {
        Ok(api_key)
    }
}

fn command_error_detail(stderr: &[u8]) -> String {
    let detail = String::from_utf8_lossy(stderr).trim().to_string();
    if detail.is_empty() {
        "No error detail returned.".to_string()
    } else {
        detail
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_unknown_mode_to_demo() {
        let config = normalize_config(ProviderConfig {
            mode: "surprise".to_string(),
            local_base_url: "  ".to_string(),
            local_model: " qwen2.5-coder ".to_string(),
            external_provider: "  ".to_string(),
            external_model: "  ".to_string(),
            api_key_stored: true,
        });

        assert_eq!(config.mode, "demo");
        assert_eq!(config.local_base_url, "http://127.0.0.1:11434/v1");
        assert_eq!(config.local_model, "qwen2.5-coder");
        assert_eq!(config.external_provider, "OpenAI");
        assert_eq!(config.external_model, "gpt-4.1-mini");
        assert!(config.api_key_stored);
    }

    #[test]
    fn builds_openai_compatible_chat_url() {
        assert_eq!(
            chat_completions_url("http://127.0.0.1:11434/v1"),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("http://127.0.0.1:1234"),
            "http://127.0.0.1:1234/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("http://localhost:8080/v1/chat/completions"),
            "http://localhost:8080/v1/chat/completions"
        );
    }

    #[test]
    fn builds_ollama_tags_url_from_openai_base_url() {
        assert_eq!(
            ollama_tags_url("http://127.0.0.1:11434/v1"),
            "http://127.0.0.1:11434/api/tags"
        );
        assert_eq!(
            ollama_tags_url("http://127.0.0.1:11434/v1/chat/completions"),
            "http://127.0.0.1:11434/api/tags"
        );
        assert_eq!(
            ollama_tags_url("http://127.0.0.1:11434/api"),
            "http://127.0.0.1:11434/api/tags"
        );
    }

    #[test]
    fn detects_apple_foundation_models_endpoint_and_models_url() {
        assert!(is_apple_foundation_models_endpoint(
            "http://127.0.0.1:1976/v1",
            "system"
        ));
        assert_eq!(
            openai_models_url("http://127.0.0.1:1976/v1"),
            "http://127.0.0.1:1976/v1/models"
        );
    }

    #[test]
    fn labels_apple_foundation_models_endpoint() {
        assert_eq!(
            local_provider_label("http://127.0.0.1:1976/v1"),
            "Apple Foundation Models endpoint"
        );
    }

    #[test]
    fn local_chat_requests_disable_streaming() {
        let request = ChatCompletionRequest {
            model: "system".to_string(),
            temperature: 0.2,
            stream: false,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
        };
        let value = serde_json::to_value(request).unwrap();

        assert_eq!(value.get("stream"), Some(&serde_json::Value::Bool(false)));
    }

    #[test]
    fn external_openai_chat_url_is_stable() {
        assert_eq!(
            external_chat_completions_url("OpenAI"),
            Some("https://api.openai.com/v1/chat/completions".to_string())
        );
        assert_eq!(external_chat_completions_url("Anthropic"), None);
    }

    #[test]
    fn external_provider_status_requires_stored_key_before_network() {
        let config = ProviderConfig {
            mode: "external".to_string(),
            local_base_url: "http://127.0.0.1:11434/v1".to_string(),
            local_model: "gemma4:26b".to_string(),
            external_provider: "OpenAI".to_string(),
            external_model: "gpt-4.1-mini".to_string(),
            api_key_stored: false,
        };

        let status = tauri::async_runtime::block_on(check_provider_status(&config));

        assert!(!status.available);
        assert!(!status.model_installed);
        assert_eq!(status.label, "External API key missing");
        assert_eq!(
            status.checked_url,
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn external_provider_call_requires_stored_key() {
        let config = ProviderConfig {
            mode: "external".to_string(),
            local_base_url: "http://127.0.0.1:11434/v1".to_string(),
            local_model: "gemma4:26b".to_string(),
            external_provider: "OpenAI".to_string(),
            external_model: "gpt-4.1-mini".to_string(),
            api_key_stored: false,
        };

        let error =
            tauri::async_runtime::block_on(ask_provider_with_prompt(&config, "System", "User"))
                .expect_err("external provider without a stored key should not run");

        assert!(error.contains("External API key is not stored"));
    }

    #[test]
    fn external_provider_status_reports_unsupported_provider() {
        let config = ProviderConfig {
            mode: "external".to_string(),
            local_base_url: "http://127.0.0.1:11434/v1".to_string(),
            local_model: "gemma4:26b".to_string(),
            external_provider: "Anthropic".to_string(),
            external_model: "claude-sonnet-4-5".to_string(),
            api_key_stored: true,
        };

        let status = tauri::async_runtime::block_on(check_provider_status(&config));

        assert!(!status.available);
        assert_eq!(status.label, "External provider unsupported");
        assert!(status
            .detail
            .contains("OpenAI is the supported external provider"));
    }

    #[test]
    fn openai_chat_response_content_is_trimmed() {
        let response = ChatCompletionResponse {
            choices: vec![ChatChoice {
                message: ChatChoiceMessage {
                    content: "  A compact answer.  ".to_string(),
                },
            }],
        };

        assert_eq!(
            answer_content_from_response(response, "OpenAI API").unwrap(),
            "A compact answer."
        );
    }

    #[test]
    #[ignore = "requires `fm serve --host 127.0.0.1 --port 1976`"]
    fn apple_foundation_models_live_smoke_returns_answer() {
        let config = ProviderConfig {
            mode: "local".to_string(),
            local_base_url: "http://127.0.0.1:1976/v1".to_string(),
            local_model: "system".to_string(),
            external_provider: "OpenAI".to_string(),
            external_model: "gpt-4.1-mini".to_string(),
            api_key_stored: false,
        };

        tauri::async_runtime::block_on(async {
            let status = check_local_provider_status(&config).await;
            assert!(status.available, "{}", status.detail);
            assert!(status.model_installed, "{}", status.detail);

            let answer = ask_provider_with_prompt(
                &config,
                "You are a short native QA smoke test.",
                "Reply with one short sentence confirming the local provider answered.",
            )
            .await
            .expect("Apple Foundation Models should answer through fm serve");

            assert_eq!(answer.provider_label, "Apple Foundation Models endpoint");
            assert_eq!(answer.model, "system");
            assert!(!answer.content.trim().is_empty());
        });
    }
}
