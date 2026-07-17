export type BlinkBackend = "llamacpp" | "openai" | "ollama";

interface BaseModelConfig {
  name: string;
  backend: BlinkBackend;
  modelId: string;
  maxTokens: number;
  requestTimeoutMs: number;
  fim: string;
}
export interface LlamaCppModelConfig extends BaseModelConfig {
  backend: "llamacpp";
  localModelPath: string;
  gpu?: "auto" | "cuda" | "vulkan" | "metal" | "off";
}
export interface OpenAiModelConfig extends BaseModelConfig {
  backend: "openai";
  apiBaseUrl: string;
  apiKey: string;
  /**
   * "raw" (default): POST the locally FIM-templated prompt as `prompt`.
   * "prefix-suffix": POST the untemplated prefix as `prompt` and the suffix as
   * `suffix` — for endpoints that apply the FIM template server-side
   * (Mistral /v1/fim/completions, legacy OpenAI /v1/completions with suffix).
   */
  promptStyle?: "raw" | "prefix-suffix";
}
export interface OllamaModelConfig extends BaseModelConfig {
  backend: "ollama";
  baseUrl: string;
}
export type ModelConfig = LlamaCppModelConfig | OpenAiModelConfig | OllamaModelConfig;

/** The active model: the entry whose name matches the selector. Pure. */
export function resolveActiveModel(models: ModelConfig[], name: string): ModelConfig | undefined {
  return models.find((m) => m.name === name);
}

/** Whether a model has the connection fields its backend needs. Pure. */
export function isModelConfigured(model: ModelConfig): boolean {
  switch (model.backend) {
    case "llamacpp":
      return model.localModelPath.trim().length > 0;
    case "openai":
      return model.apiBaseUrl.trim().length > 0 && model.apiKey.trim().length > 0;
    case "ollama":
      return model.baseUrl.trim().length > 0;
  }
}

/**
 * Per-backend request-timeout defaults: settings entries pass through raw (VS
 * Code does not apply item defaults inside array settings), so a missing
 * requestTimeoutMs must be defaulted here. Remote backends get longer than the
 * in-process one.
 */
const REQUEST_TIMEOUT_DEFAULTS_MS: Record<BlinkBackend, number> = {
  llamacpp: 3000,
  openai: 10000,
  ollama: 10000,
};

/** The entry's requestTimeoutMs, or its backend's default when omitted. Pure. */
export function requestTimeoutFor(model: ModelConfig): number {
  return model.requestTimeoutMs ?? REQUEST_TIMEOUT_DEFAULTS_MS[model.backend];
}

/** Short human label for the model's target, for the status bar. Pure. */
export function modelTarget(model: ModelConfig): string {
  switch (model.backend) {
    case "llamacpp": {
      const parts = model.localModelPath.split(/[\\/]/);
      return parts[parts.length - 1] || model.localModelPath;
    }
    case "openai":
      try { return new URL(model.apiBaseUrl).host; } catch { return model.apiBaseUrl; }
    case "ollama":
      return model.baseUrl;
  }
}
