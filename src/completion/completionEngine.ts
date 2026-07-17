import type { BlinkConfig } from "../config/config.js";
import type { ModelConfig } from "../config/models.js";
import type { CompletionClient } from "../clients/types.js";
import { CompletionCache } from "../cache.js";
import { assembleContext } from "./contextAssembler.js";
import { postProcess } from "./postProcess.js";
import type { Cancellable } from "../provider/debounce.js";
import type { ContextFile } from "../edits/editTracker.js";
import { ILogger } from "../common/logging.js";
import { FimTemplates } from "./fimTemplates.js";
import { token, Inject } from "../di/container.js";

export interface CompletionRequestFile {
  path: string;
  content: string;
}
export interface CompletionRequest {
  repoName: string,
  filePath?: string,
  prefix: string;
  suffix: string;
  files: CompletionRequestFile[]

  // fullText: string;
  // cursorOffset: number;
  // filePath?: string;
  // repoName?: string;
  // contextFiles?: ContextFile[];
  // config: BlinkConfig;
  // model: ModelConfig;
  // token: Cancellable;
  // signal: AbortSignal;
}

export interface CompletionResult {
  text: string | null;
  cacheHit: boolean;
}

export interface ICompletionEngine {
  setClient(client: CompletionClient): void;
  prewarm(): void;
  complete(req: CompletionRequest, signal: AbortSignal): Promise<CompletionResult>;
}

// Merges with the interface above: one name serves as both type and token.
export const ICompletionEngine = token<ICompletionEngine>("engine");

/**
 * Orchestrates one completion request: gate -> cache -> assemble -> build ->
 * call -> post-process. Holds the active client (set on config change) and the
 * cache. No vscode types, so it is fully unit-testable with a fake client.
 */
export class CompletionEngine implements ICompletionEngine {
  private client: CompletionClient | undefined;

  constructor(
    @Inject(FimTemplates) private readonly fims: FimTemplates,
    @Inject(CompletionCache) private readonly cache: CompletionCache,
    @ILogger private readonly log?: ILogger,
  ) { }

  setClient(client: CompletionClient): void {
    this.client = client;
  }

  prewarm(): void {
    this.client?.prewarm?.();
  }

  async complete(req: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    if (!this.client) {
      return { text: null, cacheHit: false };
    }
    const fimPrefix = await this.client.getFimPrefix();

    const fimTemplate = this.fims.get(fimPrefix ?? "auto");
    // if (!config.enabled) { return { text: null, cacheHit: false }; }
    // if (token.isCancellationRequested) { return { text: null, cacheHit: false }; }

    // const maxHeaderChars = Math.min(500, Math.floor(config.maxPrefixChars * 0.25));
    // const ctx = assembleContext(
    //   req.fullText,
    //   req.cursorOffset,
    //   config.maxPrefixChars,
    //   config.maxSuffixChars,
    //   maxHeaderChars,
    // );

    // const contextSig = (req.contextFiles ?? [])
    //   .map((f) => `${f.path}:${f.content}`)
    //   .join("\x1e");
    // const scope = `${model.modelId}\x1f${req.filePath ?? ""}\x1f${model.promptFormat}\x1f${contextSig}`;
    // const key = this.cache.makeKey(
    //   model.modelId,
    //   ctx.prefix,
    //   ctx.suffix,
    //   req.filePath ?? "",
    //   model.promptFormat,
    //   contextSig,
    // );
    // const cached = this.cache.get(key);
    // if (cached !== undefined) {
    //   if (cached.length > 0) {
    //     this.cache.recordServed(scope, ctx.prefix, ctx.suffix, cached);
    //     return { text: cached, cacheHit: true };
    //   }
    //   return { text: null, cacheHit: true };
    // }

    // const reused = this.cache.reuse(scope, ctx.prefix, ctx.suffix);
    // if (reused !== null) {
    //   this.cache.recordServed(scope, ctx.prefix, ctx.suffix, reused);
    //   return { text: reused, cacheHit: true };
    // }

    // const { prompt, stop } = buildPrompt(ctx, {
    //   model: model.modelId,
    //   path: req.filePath,
    //   repoName: req.repoName,
    //   files: req.contextFiles,
    //   promptFormat: model.promptFormat,
    // });

    let raw: string;
    try {
      const prompt = fimTemplate.render(req);

      raw = await this.client.complete(prompt, fimTemplate.stop, signal, {
        prefix: req.prefix,
        suffix: req.suffix,
      });
    } catch (err) {
      this.log?.info(`completion request failed: ${String(err)}`);
      return { text: null, cacheHit: false };
    }

    // if (token.isCancellationRequested) { return { text: null, cacheHit: false }; }

    // const cleaned = postProcess(raw, { prefix: ctx.prefix, suffix: ctx.suffix, stop });
    // this.cache.set(key, cleaned);
    // if (cleaned.length > 0) {
    //   this.cache.recordServed(scope, ctx.prefix, ctx.suffix, cleaned);
    // }
    // return { text: cleaned.length > 0 ? cleaned : null, cacheHit: false };
    return { text: raw, cacheHit: false };
  }
}
