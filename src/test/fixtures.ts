import type { BlinkConfig } from "../config/config.js";
import type { LlamaCppModelConfig, OpenAiModelConfig, OllamaModelConfig } from "../config/models.js";

export function llamaModel(over: Partial<LlamaCppModelConfig> = {}): LlamaCppModelConfig {
  return {
    name: "local-qwen", backend: "llamacpp", modelId: "qwen2.5-coder",
    localModelPath: "C:\\m.gguf", maxTokens: 256, fim: "<|fim_prefix|>",
    requestTimeoutMs: 3000, ...over,
  };
}
export function openAiModel(over: Partial<OpenAiModelConfig> = {}): OpenAiModelConfig {
  return {
    name: "gpt", backend: "openai", modelId: "qwen2.5-coder",
    apiBaseUrl: "https://api.example.com/v1", apiKey: "sk-test",
    maxTokens: 256, fim: "<|fim_prefix|>", requestTimeoutMs: 3000, ...over,
  };
}
export function ollamaModel(over: Partial<OllamaModelConfig> = {}): OllamaModelConfig {
  return {
    name: "oll", backend: "ollama", modelId: "qwen2.5-coder",
    baseUrl: "http://localhost:11434", maxTokens: 256, fim: "<|fim_prefix|>",
    requestTimeoutMs: 3000, ...over,
  };
}
export function globalConfig(over: Partial<BlinkConfig> = {}): BlinkConfig {
  return {
    enabled: true, model: "local-qwen", models: [llamaModel()],
    disabledFiles: [], enableInChat: false, enableInCommitMessage: false, disabledSchemes: [],
    debounceMs: 0, maxPrefixChars: 2000, maxSuffixChars: 1000,
    recentEditsEnabled: true, recentEditsMaxSnippets: 3, recentEditsMaxChars: 800,
    lspContextEnabled: false, lspContextMaxSnippets: 3, lspContextMaxChars: 600,
    lspContextBudgetMs: 60, ...over,
  };
}
