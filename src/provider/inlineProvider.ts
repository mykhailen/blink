import * as vscode from "vscode";
import * as path from "node:path";
import { IConfigProvider } from "../config/config.js";
import { isDisabledScheme, matchDisabledFile } from "../config/fileBlacklist.js";
import type { ModelConfig } from "../config/models.js";
import { shouldRequest } from "./trigger.js";
import { delay } from "./debounce.js";
import { ICompletionEngine } from "../completion/completionEngine.js";
import { ICompletionComposer } from "../context/composer.js";
import { Metrics } from "../metrics.js";
import { StatusStore } from "../status/statusStore.js";
import { ILogger } from "../common/logging.js";
import { token, Inject } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

export const DID_ACCEPT_COMMAND = "blink.didAccept";

// Merges with the interface below: one name serves as both type and token.
export const IInlineCompletionItemProvider = token<IInlineCompletionItemProvider>("inlineProvider");

export interface IInlineCompletionItemProvider extends vscode.InlineCompletionItemProvider {
  register(): void;
  setEnabled(enabled: boolean): void;
  setModel(model: ModelConfig | undefined): void;
  readonly lastPrompt: string | undefined;
}

/**
 * Thin VS Code adapter: gates (enabled/trigger/debounce), extracts plain values,
 * delegates context gathering and orchestration to injected collaborators, maps
 * the result to an InlineCompletionItem, and records a metric sample. No
 * completion logic lives here. F5-verified (no unit test).
 */
export class BlinkInlineProvider implements IInlineCompletionItemProvider {
  private _enabled = false;
  private _model: ModelConfig | undefined;
  private _lastPrompt: string | undefined;

  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @IConfigProvider private readonly config: IConfigProvider,
    @ICompletionEngine private readonly engine: ICompletionEngine,
    @ICompletionComposer private readonly composer: ICompletionComposer,
    @Inject(Metrics) private readonly metrics: Metrics,
    @Inject(StatusStore) private readonly status: StatusStore,
    @ILogger private readonly log: ILogger,
  ) { }

  get lastPrompt(): string | undefined {
    return this._lastPrompt;
  }

  register(): void {
    this.context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, this),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme === "file" || doc.uri.scheme === "untitled") {
          this.maybePrewarm();
        }
      }),
    );
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.maybePrewarm();
  }

  setModel(model: ModelConfig | undefined): void {
    this._model = model;
    this.maybePrewarm();
  }

  /**
   * Warm the active client's engine when there's something to complete in — a
   * real file/untitled editor is active and we're enabled with a model. Safe to
   * call repeatedly: engine.prewarm() is idempotent. Skips other schemes (e.g.
   * the blink output channel) so activation alone never triggers a load.
   */
  private maybePrewarm(): void {
    if (!this._enabled || !this._model) { return; }
    const scheme = vscode.window.activeTextEditor?.document.uri.scheme;
    if (scheme === "file" || scheme === "untitled") {
      this.engine.prewarm();
    }
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | null> {
    if (!this._enabled || !this._model) {
      return null;
    }
    const model = this._model;
    const config = this.config.readConfig();

    // Chat prompt boxes, the SCM commit box, etc. are text documents too; the
    // "**" selector reaches them, so gate on the URI scheme.
    if (isDisabledScheme(document.uri.scheme, config)) {
      return null;
    }
    if (matchDisabledFile(path.basename(document.fileName), config.disabledFiles)) {
      return null;
    }

    // const line = document.lineAt(position.line).text;
    // const lineSuffix = line.slice(position.character);
    // const isInvoke = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
    // if (!shouldRequest(lineSuffix, isInvoke)) {
    //   return null;
    // }

    // const proceed = await delay(config.debounceMs, token);
    // if (!proceed) {
    //   return null;
    // }

    const controller = new AbortController();
    const sub = token.onCancellationRequested(() => controller.abort());

    // this.status.setWorking(true);
    const started = Date.now();
    try {
      /*
      ContextBuilder
        ├─ TextWindowProvider        // before/after cursor
        ├─ TokenProvider             // current word, line, indentation
        ├─ SymbolProvider            // current function/class/block
        ├─ DiagnosticsProvider       // nearby errors/warnings
        ├─ NativeCompletionProvider  // VS Code/LSP suggestions
        ├─ ImportProvider            // imports in current file
        ├─ WorkspaceProvider         // relevant files / specs / package.json
        └─ DomainProvider            // HTTL/OpenAPI/appa-specific context
      */
      // const fullText = document.getText();
      // const cursorOffset = document.offsetAt(position);

      // const filePath = document.isUntitled
      //   ? undefined
      //   : vscode.workspace.asRelativePath(document.uri);

      // const repoName = vscode.workspace.workspaceFolders?.[0]?.name ?? "workspace";

      const completionRequest = await this.composer.compose(document, position, config);

      const { text, cacheHit } = await this.engine.complete(completionRequest, controller.signal);

      // const latencyMs = Date.now() - started;
      if (text === null || token.isCancellationRequested) {
        // this.metrics.recordServed({ latencyMs, cacheHit, served: false });
        return null;
      }

      // this.metrics.recordServed({ latencyMs, cacheHit, served: true });
      // this.log.info(`blink: ${cacheHit ? "hit" : "miss"} ${latencyMs}ms len=${text.length}`);

      const item = new vscode.InlineCompletionItem(text, new vscode.Range(position, position));
      item.command = { title: "", command: DID_ACCEPT_COMMAND };
      return [item];
    } catch (err) {
      this.log.info(`provideInlineCompletionItems error: ${String(err)}`);
      return null;
    } finally {
      // this.status.setWorking(false);
      sub.dispose();
    }
  }
}
