import type { OpenAiModelConfig } from "../config/models.js";
import { uniqueName } from "./modelPicker.js";

/**
 * A remote OpenAI-backend preset the picker can add: fixed fields plus which
 * inputs to prompt for. `apiBaseUrl` absent means the URL is prompted.
 */
export interface RemotePreset {
  /** Picker row label. */
  label: string;
  /** Picker row description. */
  description: string;
  /** Fixed endpoint; prompted when absent. */
  apiBaseUrl?: string;
  /** Prefill for the model-id input. */
  defaultModelId?: string;
  promptStyle: "raw" | "prefix-suffix";
  /** Model name becomes "<prefix>-<modelId>" instead of just the model id. */
  namePrefix?: string;
}

export const REMOTE_PRESETS: RemotePreset[] = [
  {
    label: "OpenAI-compatible endpoint…",
    description: "any /v1/completions API",
    promptStyle: "raw",
  },
  {
    label: "Mistral Codestral",
    description: "api.mistral.ai · FIM",
    apiBaseUrl: "https://api.mistral.ai/v1/fim/completions",
    defaultModelId: "codestral-2508",
    promptStyle: "prefix-suffix",
    namePrefix: "mistral",
  },
];

/** What the input boxes collect. */
export interface RemoteInputs {
  apiBaseUrl: string;
  modelId: string;
  apiKey: string;
}

/** ModelConfig for a remote preset + collected inputs; unique name. Pure. */
export function remoteModelConfig(
  preset: RemotePreset,
  inputs: RemoteInputs,
  takenNames: readonly string[],
): OpenAiModelConfig {
  const base = preset.namePrefix ? `${preset.namePrefix}-${inputs.modelId}` : inputs.modelId;
  return {
    name: uniqueName(base, takenNames),
    backend: "openai",
    modelId: inputs.modelId,
    apiBaseUrl: preset.apiBaseUrl ?? inputs.apiBaseUrl,
    apiKey: inputs.apiKey,
    promptStyle: preset.promptStyle,
    maxTokens: 256,
    requestTimeoutMs: 10000,
    fim: "",
  };
}
