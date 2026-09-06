import * as vscode from "vscode";
import type { BlinkConfig } from "../config/config.js";
import { IEditTracker, type ContextFile } from "../edits/editTracker.js";
import { ILspContextProvider } from "./lspContext.js";
import { CompletionRequest, CompletionRequestFile } from "../completion/completionEngine.js";
import { token } from "../di/container.js";

// Merges with the interface below: one name serves as both type and token.
export const ICompletionComposer = token<ICompletionComposer>("composer");

export interface ICompletionComposer {
  compose(
    document: vscode.TextDocument,
    position: vscode.Position,
    config: BlinkConfig,
  ): Promise<CompletionRequest>;
}

/**
 * Decides which context sources run for a completion, gated by config + the
 * active model's prompt format, merging recent edits first and LSP defs last
 * (nearest the FIM). The document/position are forwarded only to the LSP source.
 */
export class CompletionComposer implements ICompletionComposer {
  constructor(
    @IEditTracker private readonly editTracker: IEditTracker,
    @ILspContextProvider private readonly lsp: ILspContextProvider,
  ) { }

  async compose(
    document: vscode.TextDocument,
    position: vscode.Position,
    config: BlinkConfig,
  ): Promise<CompletionRequest> {

    const repoName = vscode.workspace.workspaceFolders?.[0]?.name ?? "workspace";
    const filePath = document.isUntitled
      ? undefined
      : vscode.workspace.asRelativePath(document.uri);

    const fullText = document.getText();
    const cursorOffset = document.offsetAt(position);

    let prefix = fullText.slice(0, cursorOffset);
    const suffix = fullText.slice(cursorOffset);

    const files: CompletionRequestFile[] = [];

    // Unit tests drive compose() with minimal fakes that have no uri; skip the
    // completion-provider lookup for them (real documents always carry one).
    const completions = document.uri
      ? await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        document.uri,
        position
      )
      : undefined;

    const completionItems =
      completions?.items
        .filter(item => this.shouldKeepCompletion(item))
        .slice(0, 80)
        .map(item => this.normalizeCompletionItem(item)) ?? [];

    if (completionItems.length) {
      // files.push({
      //   path: './cursor-context.ts',
      //   content: `{\n${completionItems.map(x => `${x.label}: ${x.insertText},`).join('\n')}\n}`
      // });
      prefix = `/*
context: {\n${completionItems.map(x => `${x.label}: ${x.insertText},`).join('\n')}\n}
*/\n` + prefix;
    }


    // const recentEdits =
    //   repoFormat && config.recentEditsEnabled
    //     ? this.editTracker.select(filePath, config.recentEditsMaxSnippets, config.recentEditsMaxChars)
    //     : [];

    // const defs =
    //   repoFormat && config.lspContextEnabled
    //     ? await this.lsp.collect(
    //       document,
    //       position,
    //       config.lspContextMaxSnippets,
    //       config.lspContextMaxChars,
    //       config.lspContextBudgetMs,
    //     )
    //     : [];

    return {
      repoName,
      filePath,
      prefix,
      suffix,
      files
    };
  }

  normalizeCompletionItem(item: vscode.CompletionItem) {
    const label =
      typeof item.label === "string"
        ? item.label
        : item.label.label;

    const insertText =
      typeof item.insertText === "string"
        ? item.insertText
        : item.insertText instanceof vscode.SnippetString
          ? item.insertText.value
          : undefined;

    return {
      label,
      kind: item.kind,
      detail: this.truncate(item.detail, 160),
      insertText: this.truncate(insertText, 300),
      sortText: item.sortText,
      filterText: item.filterText,
    };
  }

  shouldKeepCompletion(item: vscode.CompletionItem) {
    const label =
      typeof item.label === "string"
        ? item.label
        : item.label.label;

    if (!label) { return false; }

    // Too noisy / useless for LLM context
    if (label.trim().length === 0) { return false; }
    if (label.length > 120) { return false; }

    // Usually huge and low value
    if (item.documentation) { return false; }

    // Optional: remove snippets if you only want semantic symbols
    if (item.kind === vscode.CompletionItemKind.Snippet) { return false; }

    // Optional: remove plain text suggestions
    if (item.kind === vscode.CompletionItemKind.Text) { return false; }

    return true;
  }

  truncate(value: unknown, max: number) {
    if (typeof value !== "string") { return undefined; }
    return value.length > max ? value.slice(0, max) + "…" : value;
  }
}