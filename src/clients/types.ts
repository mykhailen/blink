import type { ModelConfig } from "../config/models.js";

/** The untemplated context halves, for clients whose endpoint templates server-side. */
export interface FimParts {
  prefix: string;
  suffix: string;
}

/**
 * The cross-backend completion contract the engine depends on. Never throws — a
 * client returns "" on any failure so the editor shows nothing. `parts` carries
 * the raw prefix/suffix alongside the rendered prompt; clients that POST them
 * separately (openai prefix-suffix style) use it, everyone else ignores it.
 */
export interface CompletionClient {
  complete(prompt: string, stop: string[], signal: AbortSignal, parts?: FimParts): Promise<string>;
  /** Optional eager load so the first complete() has no startup lag. Stateless clients omit it. */
  prewarm?(): void;
  getFimPrefix(): Promise<string | null>;
  config?: ModelConfig;
}

/**
 * A client the manager owns: configurable per model and disposable. The registry
 * creates these; the manager applies the active model via setConfig.
 */
export interface ManagedClient extends CompletionClient {
  setConfig(model: ModelConfig): void;
  /** Subscribe to model-load failures (status-bar signal). Stateless clients no-op. */
  onLoadError(listener: (message: string) => void): void;
  dispose(): Promise<void>;
}
