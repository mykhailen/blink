import type { FimParts, ManagedClient } from "../types.js";
import { requestTimeoutFor, type ModelConfig, type OpenAiModelConfig } from "../../config/models.js";
import type { ILogger } from "../../common/logging.js";

interface OpenAiOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  promptStyle: "raw" | "prefix-suffix";
}

/**
 * Minimal OpenAI-compatible /v1/completions client. `fetchFn` is injectable so
 * the orchestrator can be tested without real network access. Config is applied
 * via setConfig (the manager calls it before each use). Never throws on
 * HTTP/transport failure — returns "" so the editor shows nothing.
 */
export class OpenAICompletionClient implements ManagedClient {
  private opts: OpenAiOpts | undefined;
  private model: OpenAiModelConfig | undefined;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly logger?: ILogger,
  ) { }

  setConfig(model: ModelConfig): void {
    const m = model as OpenAiModelConfig;
    this.model = m;
    this.opts = {
      baseUrl: m.apiBaseUrl,
      apiKey: m.apiKey,
      model: m.modelId,
      maxTokens: m.maxTokens,
      timeoutMs: requestTimeoutFor(m),
      promptStyle: m.promptStyle ?? "raw",
    };
  }

  onLoadError(): void {
    // stateless HTTP client — no load step, nothing to report
  }

  async dispose(): Promise<void> {
    // stateless HTTP client — nothing to tear down
  }

  public get config(): ModelConfig | undefined {
    return this.model;
  }

  /** The configured model's FIM token; null before setConfig (auto template). */
  public async getFimPrefix(): Promise<string | null> {
    return this.model?.fim ?? null;
  }

  async complete(prompt: string, stop: string[], signal: AbortSignal, parts?: FimParts): Promise<string> {
    const opts = this.opts;
    if (!opts) { return ""; }

    const base = opts.baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/completions") ? base : `${base}/completions`;

    const fim = opts.promptStyle === "prefix-suffix" && parts
      ? { prompt: parts.prefix, suffix: parts.suffix }
      : { prompt };

    const internalController = new AbortController();
    const timer = setTimeout(() => internalController.abort(), opts.timeoutMs);
    const onAbort = () => internalController.abort();
    signal.addEventListener("abort", onAbort);
    if (signal.aborted) {
      internalController.abort();
    }

    try {
      if (internalController.signal.aborted) {
        return "";
      }
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          ...fim,
          max_tokens: opts.maxTokens,
          temperature: 0,
          stop,
        }),
        signal: internalController.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger?.info(`openai completion failed: HTTP ${res.status} ${body.slice(0, 200)}`);
        return "";
      }
      // Classic completions return choices[].text; Mistral's FIM endpoint
      // answers in the chat shape, choices[].message.content.
      const data = (await res.json()) as {
        choices?: Array<{ text?: string; message?: { content?: string } }>;
      };
      const choice = data.choices?.[0];
      return choice?.text ?? choice?.message?.content ?? "";
    } catch (error) {
      this.logger?.info(`openai completion failed: ${error}`);
      return "";
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}
