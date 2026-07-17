import type { ManagedClient } from "../types.js";
import type { ILogger } from "../../common/logger.js";
import { requestTimeoutFor, type ModelConfig, type LlamaCppModelConfig } from "../../config/models.js";
import { CompletionRequest } from "../../completion/completionEngine.js";

/** Thrown when the configured local model lacks FIM/infill tokens. */
export class UnsupportedModelError extends Error { }

/** The minimal generation engine the local client drives. Implemented by realLlamaEngine. */
export interface LlamaEngine {
  complete(
    prompt: string,
    opts: { maxTokens: number; stop: string[]; signal: AbortSignal },
  ): Promise<string>;
  dispose(): Promise<void>;
  getFimPrefix(): string | null
}

export type EngineLoader = (cfg: { modelPath: string; gpu: string }) => Promise<LlamaEngine>;

interface LocalOpts {
  modelPath: string;
  gpu: string;
  maxTokens: number;
  timeoutMs: number;
}

/**
 * Local GGUF completion client. Deps-only constructor; the active model is
 * applied via setConfig, which resets the loaded engine when the model path or
 * gpu changes (so the next complete() reloads). Never throws — returns "".
 */
export class LocalLlamaCompletionClient implements ManagedClient {
  private _config: ModelConfig | undefined;
  private opts: LocalOpts | undefined;
  private enginePromise: Promise<LlamaEngine> | undefined;
  private loadFailed = false;
  private notifiedLoadError = false;
  private queue: Promise<unknown> = Promise.resolve();
  private loadErrorListener: (message: string) => void = () => { };

  constructor(
    private readonly loader: EngineLoader,
    private readonly log: ILogger = { info: () => { }, error: () => { } },
  ) { }


  public get config(): ModelConfig | undefined {
    return this._config;
  }

  public async getFimPrefix() {
    const engine = await this.ensureEngine(this.opts!);
    return engine!.getFimPrefix();
  }

  onLoadError(listener: (message: string) => void): void {
    this.loadErrorListener = listener;
  }

  /** Eagerly start loading the engine so the first complete() has no load lag. */
  prewarm(): void {
    if (!this.opts || this.loadFailed) { return; }
    void this.ensureEngine(this.opts);
  }

  setConfig(model: ModelConfig): void {
    this._config = model;
    const m = model as LlamaCppModelConfig;
    const next: LocalOpts = {
      modelPath: m.localModelPath,
      gpu: m.gpu ?? "auto",
      maxTokens: m.maxTokens,
      timeoutMs: requestTimeoutFor(m),
    };
    // Only the model path / gpu affect the loaded engine; maxTokens/timeout are
    // per-generation. Reset (reload on next complete) only when those change.
    const needsReload =
      !this.opts || this.opts.modelPath !== next.modelPath || this.opts.gpu !== next.gpu;
    this.opts = next;
    if (needsReload) {
      void this.resetEngine();
    }
  }

  private async resetEngine(): Promise<void> {
    const p = this.enginePromise;
    this.enginePromise = undefined;
    this.loadFailed = false;
    this.notifiedLoadError = false;
    if (!p) { return; }
    try { (await p).dispose(); } catch { /* best-effort */ }
  }

  async complete(prompt: string, stop: string[], signal: AbortSignal): Promise<string> {
    if (!this.opts || this.loadFailed || signal.aborted) { return ""; }
    const run = this.queue.then(() => this.runOne(prompt, stop, signal));
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runOne(prompt: string, stop: string[], signal: AbortSignal): Promise<string> {
    const opts = this.opts;
    if (!opts || this.loadFailed || signal.aborted) { return ""; }

    const engine = await this.ensureEngine(opts);
    if (!engine) { return ""; }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), opts.timeoutMs);
    const onAbort = () => timeout.abort();
    signal.addEventListener("abort", onAbort);
    if (signal.aborted) { timeout.abort(); }

    try {
      if (timeout.signal.aborted) { return ""; }
      return await engine.complete(prompt, {
        maxTokens: opts.maxTokens,
        stop,
        signal: timeout.signal,
      });
    } catch (err) {
      this.log.info(`local generation failed: ${String(err)}`);
      return "";
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  private async ensureEngine(opts: LocalOpts): Promise<LlamaEngine | undefined> {
    try {
      return await this.getEngine(opts);
    } catch (err) {
      this.loadFailed = true;
      if (!this.notifiedLoadError) {
        this.notifiedLoadError = true;
        this.log.info(`model load failed: ${String(err)}`);
        const message =
          err instanceof UnsupportedModelError
            ? err.message
            : "blink: failed to load the local model: " +
            (err instanceof Error ? err.message : String(err));
        this.log.error(message);          // logs + vscode error popup
        this.loadErrorListener(message);  // status-bar signal (manager -> start())
      }
      return undefined;
    }
  }

  private getEngine(opts: LocalOpts): Promise<LlamaEngine> {
    if (!this.enginePromise) {
      this.enginePromise = this.loader({ modelPath: opts.modelPath, gpu: opts.gpu });
    }
    return this.enginePromise;
  }

  async dispose(): Promise<void> {
    const p = this.enginePromise;
    this.enginePromise = undefined;
    if (!p) { return; }
    try {
      const engine = await p;
      await engine.dispose();
    } catch {
      // best-effort — model may have failed to load
    }
  }
}
