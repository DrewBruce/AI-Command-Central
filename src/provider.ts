import type { BackendMode, ProviderConfig, ProviderEndpointStatus, ProviderReadiness } from "./types";

export const providerStorageKey = "ai-command-central.provider-config.v1";
export const ollamaGemmaModel = "gemma4:26b";
export const ollamaOpenAiBaseUrl = "http://127.0.0.1:11434/v1";
export const appleFoundationModelsModel = "system";
export const appleFoundationModelsOpenAiBaseUrl = "http://127.0.0.1:1976/v1";
export const appleFoundationModelsAgentModel = "Apple Foundation Models: system";
export const appleFoundationModelsGuidance =
  "Best for private, app-grounded summarising, classification, extraction, rewriting, and short structured drafts. Use larger local or cloud models for deep reasoning, long-context advisory, current facts, or autonomous actions.";

export const defaultProviderConfig: ProviderConfig = {
  mode: "demo",
  localBaseUrl: ollamaOpenAiBaseUrl,
  localModel: ollamaGemmaModel,
  externalProvider: "OpenAI",
  externalModel: "gpt-4.1-mini",
  apiKeyStored: false
};

export const ollamaGemmaProviderPreset: ProviderConfig = {
  ...defaultProviderConfig,
  mode: "local",
  localBaseUrl: ollamaOpenAiBaseUrl,
  localModel: ollamaGemmaModel
};

export const appleFoundationModelsProviderPreset: ProviderConfig = {
  ...defaultProviderConfig,
  mode: "local",
  localBaseUrl: appleFoundationModelsOpenAiBaseUrl,
  localModel: appleFoundationModelsModel
};

export function normalizeProviderConfig(config: Partial<ProviderConfig> | null | undefined): ProviderConfig {
  const mode = config?.mode === "local" || config?.mode === "external" ? config.mode : "demo";
  return {
    mode,
    localBaseUrl: clean(config?.localBaseUrl, defaultProviderConfig.localBaseUrl),
    localModel: clean(config?.localModel, defaultProviderConfig.localModel),
    externalProvider: clean(config?.externalProvider, defaultProviderConfig.externalProvider),
    externalModel: clean(config?.externalModel, defaultProviderConfig.externalModel),
    apiKeyStored: Boolean(config?.apiKeyStored)
  };
}

export function getProviderReadiness(
  config: ProviderConfig,
  backendMode: BackendMode,
  endpointStatus?: ProviderEndpointStatus | null
): ProviderReadiness {
  const normalized = normalizeProviderConfig(config);
  if (backendMode !== "local") {
    return {
      tone: "review",
      label: "Browser demo",
      detail: "Launch the native app to scan projects, write files, and call a local model endpoint.",
      runModeLabel: "Demo only",
      canRunLive: false,
      issues: ["Native Tauri backend is not connected in this browser tab."]
    };
  }

  if (normalized.mode === "local") {
    const issues = [];
    if (!normalized.localBaseUrl.trim()) issues.push("Local base URL is missing.");
    if (!normalized.localModel.trim()) issues.push("Local model name is missing.");
    const isAppleFoundationModels = isAppleFoundationModelsConfig(normalized);

    if (issues.length === 0 && endpointStatus) {
      if (!endpointStatus.available) {
        return {
          tone: "warn",
          label: endpointStatus.label,
          detail: endpointStatus.detail,
          runModeLabel: "Demo until local endpoint is running",
          canRunLive: false,
          issues: [endpointStatus.detail]
        };
      }

      if (!endpointStatus.modelInstalled) {
        return {
          tone: "warn",
          label: endpointStatus.label,
          detail: endpointStatus.detail,
          runModeLabel: "Demo until model installed",
          canRunLive: false,
          issues: [
            isAppleFoundationModels
              ? "Start Apple Foundation Models with: fm serve --host 127.0.0.1 --port 1976"
              : `Install the model with: ollama pull ${normalized.localModel}`
          ]
        };
      }

      return {
        tone: "ok",
        label: endpointStatus.label,
        detail: endpointStatus.detail,
        runModeLabel: isAppleFoundationModels ? "Live Apple model available" : "Live local model available",
        canRunLive: true,
        issues: []
      };
    }

    return {
      tone: issues.length > 0 ? "warn" : "ok",
      label: issues.length > 0 ? "Local provider needs setup" : "Local provider configured",
      detail:
        issues.length > 0
          ? "Add a local OpenAI-compatible base URL and model name before live Council runs."
          : isAppleFoundationModels
            ? `${normalized.localModel} via ${normalized.localBaseUrl}. Start fm serve, then use Check provider to verify Apple's local model.`
            : `${normalized.localModel} via ${normalized.localBaseUrl}. Use Check provider to verify it is installed.`,
      runModeLabel: issues.length > 0 ? "Demo until configured" : "Live local can be tried",
      canRunLive: issues.length === 0,
      issues
    };
  }

  if (normalized.mode === "external") {
    const issues = [];
    const provider = normalized.externalProvider.trim();
    const model = normalized.externalModel.trim();
    const supportedProvider = isSupportedExternalProvider(provider);
    if (!provider) issues.push("External provider is missing.");
    if (!supportedProvider) issues.push("Only OpenAI is wired as an external API provider in this build.");
    if (!model) issues.push("External model name is missing.");
    if (!normalized.apiKeyStored) issues.push("External API key is not stored in macOS Keychain.");

    if (issues.length === 0 && endpointStatus) {
      if (!endpointStatus.available) {
        return {
          tone: "warn",
          label: endpointStatus.label,
          detail: endpointStatus.detail,
          runModeLabel: "Demo until external provider is ready",
          canRunLive: false,
          issues: [endpointStatus.detail]
        };
      }

      if (!endpointStatus.modelInstalled) {
        return {
          tone: "warn",
          label: endpointStatus.label,
          detail: endpointStatus.detail,
          runModeLabel: "Demo until external model is available",
          canRunLive: false,
          issues: [`Check that ${model} is available for the stored ${provider} API key.`]
        };
      }

      return {
        tone: "ok",
        label: endpointStatus.label,
        detail: `${endpointStatus.detail} External calls send the Council prompt and local context packet to ${provider}.`,
        runModeLabel: "Live external model available",
        canRunLive: true,
        issues: []
      };
    }

    return {
      tone: issues.length > 0 ? "warn" : "review",
      label: issues.length > 0 ? "External provider needs setup" : "External provider configured",
      detail:
        issues.length > 0
          ? "OpenAI external mode needs a supported provider, model, and Keychain-stored API key."
          : `${provider} ${model}; key stored in macOS Keychain. External calls send prompts and selected local context to ${provider}. Use Check provider to verify model access.`,
      runModeLabel: issues.length > 0 ? "Demo until external setup is complete" : "Live external can be tried",
      canRunLive: issues.length === 0,
      issues
    };
  }

  return {
    tone: "review",
    label: "Demo simulation",
    detail: "Council reports are generated locally from deterministic demo logic.",
    runModeLabel: "Demo only",
    canRunLive: false,
    issues: ["Choose a local provider in Settings for live local model calls."]
  };
}

export function loadStoredProviderConfig(): ProviderConfig {
  try {
    const raw = window.localStorage.getItem(providerStorageKey);
    return normalizeProviderConfig(raw ? JSON.parse(raw) : defaultProviderConfig);
  } catch {
    return defaultProviderConfig;
  }
}

export function storeProviderConfig(config: ProviderConfig) {
  window.localStorage.setItem(providerStorageKey, JSON.stringify(normalizeProviderConfig(config)));
}

function clean(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function isAppleFoundationModelsConfig(config: ProviderConfig) {
  const model = config.localModel.trim().toLowerCase();
  const baseUrl = config.localBaseUrl.trim().toLowerCase();
  return (
    baseUrl.includes(":1976") ||
    baseUrl.includes("foundation") ||
    ((model === "system" || model === "pcc") && !baseUrl.includes("11434") && !baseUrl.includes("ollama"))
  );
}

export function isSupportedExternalProvider(provider: string) {
  return provider.trim().toLowerCase() === "openai";
}
