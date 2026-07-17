import type { LlamaCppModelConfig, ModelConfig } from "../config/models.js";
import { modelTarget } from "../config/models.js";
import type { RecommendedModel } from "./recommendedModels.js";
import type { RemotePreset } from "./remotePresets.js";

/**
 * One picker row: an existing model, a downloadable recommendation, the custom
 * escape hatch, a remote-endpoint preset, the completions on/off toggle, or
 * the settings shortcut.
 */
export type PickEntry =
  | { kind: "configured"; name: string; target: string; active: boolean }
  | { kind: "recommended"; name: string; tags: string[]; rec: RecommendedModel }
  | { kind: "custom" }
  | { kind: "remote"; preset: RemotePreset }
  | { kind: "cuda" }
  | { kind: "toggle"; enabled: boolean }
  | { kind: "settings" };

/** Merge configured models + curated recommendations into picker rows. Pure. */
export function buildPickEntries(
  models: ModelConfig[],
  recommended: RecommendedModel[],
  activeName: string,
  enabled: boolean,
  cudaAvailable = false,
  remotePresets: RemotePreset[] = [],
): PickEntry[] {
  const configured = models.map((m) => ({
    kind: "configured" as const,
    name: m.name,
    target: modelTarget(m),
    active: m.name === activeName,
  }));
  const taken = new Set(models.map((m) => m.name));
  const recs = recommended
    .filter((r) => !taken.has(r.name))
    .map((r) => ({ kind: "recommended" as const, name: r.name, tags: r.tags, rec: r }));
  return [
    ...configured,
    ...recs,
    { kind: "custom" as const },
    ...remotePresets.map((preset) => ({ kind: "remote" as const, preset })),
    ...(cudaAvailable ? [{ kind: "cuda" as const }] : []),
    { kind: "toggle" as const, enabled },
  ];
}

export function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

/** Last path segment of a URL or file path, query string stripped. Pure. */
export function filenameFromSource(source: string): string {
  const noQuery = source.split(/[?#]/)[0];
  const parts = noQuery.split(/[\\/]/);
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

/** Model name inferred from a path/URL: basename, no .gguf, lowercased. Pure. */
export function inferNameFromSource(source: string): string {
  return filenameFromSource(source).replace(/\.gguf$/i, "").toLowerCase();
}

export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) { return base; }
  let i = 2;
  while (taken.includes(`${base}-${i}`)) { i++; }
  return `${base}-${i}`;
}

/** ModelConfig for a custom path/URL: inferred unique name + silent defaults. Pure. */
export function customModelConfig(
  source: string,
  localModelPath: string,
  takenNames: readonly string[],
): LlamaCppModelConfig {
  const name = uniqueName(inferNameFromSource(source), takenNames);
  return {
    name,
    backend: "llamacpp",
    modelId: name,
    localModelPath,
    maxTokens: 256,
    requestTimeoutMs: 3000,
    fim: "<|fim_prefix|>",
  };
}
