import * as vscode from "vscode";
import { BLINK_NAME } from "../constants";
import type { ModelConfig } from "./models.js";
import { resolveActiveModel } from "./models.js";
import { token } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

export type { BlinkBackend, ModelConfig } from "./models.js";

export interface BlinkConfig {
  enabled: boolean;
  model: string;            // selector: the active model's `name`
  models: ModelConfig[];
  disabledFiles: string[];  // filename globs (basename match) where blink is off
  enableInChat: boolean;    // complete inside chat prompt inputs (chatSessionInput etc.)
  enableInCommitMessage: boolean; // complete inside the SCM commit message box (vscode-scm)
  disabledSchemes: string[]; // extra URI schemes where blink is off (always wins)
  debounceMs: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  recentEditsEnabled: boolean;
  recentEditsMaxSnippets: number;
  recentEditsMaxChars: number;
  lspContextEnabled: boolean;
  lspContextMaxSnippets: number;
  lspContextMaxChars: number;
  lspContextBudgetMs: number;
}

const DEFAULTS: BlinkConfig = {
  enabled: true,
  model: "",
  models: [],
  disabledFiles: ["*.md", "*.markdown"],
  enableInChat: false,
  enableInCommitMessage: false,
  disabledSchemes: [],
  debounceMs: 200,
  maxPrefixChars: 2000,
  maxSuffixChars: 1000,
  recentEditsEnabled: true,
  recentEditsMaxSnippets: 3,
  recentEditsMaxChars: 800,
  lspContextEnabled: false,
  lspContextMaxSnippets: 3,
  lspContextMaxChars: 600,
  lspContextBudgetMs: 60,
};

export const IConfigProvider = token<IConfigProvider>("config");

export interface IConfigProvider {
  readConfig(): BlinkConfig;
  onChange(cb: (config: BlinkConfig) => void): void;
  getActiveModelConfig(config: BlinkConfig): ModelConfig | undefined;
  /** Set blink.model (the active-model selector). Global scope. */
  setActiveModel(name: string): Promise<void>;
  /** Append an entry to blink.models. Global scope. */
  addModel(model: ModelConfig): Promise<void>;
  /** Remove an entry by name; clears blink.model if it was the active one. */
  removeModel(name: string): Promise<void>;
  /** Turn completions on/off (blink.enabled). Global scope. */
  setEnabled(enabled: boolean): Promise<void>;
  /** Append a pattern to blink.disabledFiles (no-op if present). Global scope. */
  addDisabledFile(pattern: string): Promise<void>;
  /** Remove every entry equal to the pattern from blink.disabledFiles. Global scope. */
  removeDisabledFile(pattern: string): Promise<void>;
}

export class BlinkConfigProvider implements IConfigProvider {
  constructor(@ExtensionContext private readonly context: vscode.ExtensionContext) { }

  /** Single source of truth for blink.* settings. The only module that reads config. */
  readConfig(): BlinkConfig {
    const c = vscode.workspace.getConfiguration("blink");
    const models = c.get<ModelConfig[]>("models", []);
    const disabledFiles = c.get<string[]>("disabledFiles", DEFAULTS.disabledFiles);
    const disabledSchemes = c.get<string[]>("disabledSchemes", DEFAULTS.disabledSchemes);
    return {
      enabled: c.get("enabled", DEFAULTS.enabled),
      model: c.get("model", DEFAULTS.model),
      models: Array.isArray(models) ? models : [],
      disabledFiles: Array.isArray(disabledFiles) ? disabledFiles : [],
      enableInChat: c.get("enableInChat", DEFAULTS.enableInChat),
      enableInCommitMessage: c.get("enableInCommitMessage", DEFAULTS.enableInCommitMessage),
      disabledSchemes: Array.isArray(disabledSchemes) ? disabledSchemes.filter((x) => typeof x === "string") : [],
      debounceMs: c.get("debounceMs", DEFAULTS.debounceMs),
      maxPrefixChars: c.get("maxPrefixChars", DEFAULTS.maxPrefixChars),
      maxSuffixChars: c.get("maxSuffixChars", DEFAULTS.maxSuffixChars),
      recentEditsEnabled: c.get("recentEditsEnabled", DEFAULTS.recentEditsEnabled),
      recentEditsMaxSnippets: c.get("recentEditsMaxSnippets", DEFAULTS.recentEditsMaxSnippets),
      recentEditsMaxChars: c.get("recentEditsMaxChars", DEFAULTS.recentEditsMaxChars),
      lspContextEnabled: c.get("lspContextEnabled", DEFAULTS.lspContextEnabled),
      lspContextMaxSnippets: c.get("lspContextMaxSnippets", DEFAULTS.lspContextMaxSnippets),
      lspContextMaxChars: c.get("lspContextMaxChars", DEFAULTS.lspContextMaxChars),
      lspContextBudgetMs: c.get("lspContextBudgetMs", DEFAULTS.lspContextBudgetMs),
    };
  }

  getActiveModelConfig(config: BlinkConfig): ModelConfig | undefined {
    return resolveActiveModel(config.models, config.model);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration(BLINK_NAME)
      .update("enabled", enabled, vscode.ConfigurationTarget.Global);
  }

  async addDisabledFile(pattern: string): Promise<void> {
    const patterns = this.readConfig().disabledFiles;
    if (patterns.includes(pattern)) { return; }
    await vscode.workspace.getConfiguration(BLINK_NAME)
      .update("disabledFiles", [...patterns, pattern], vscode.ConfigurationTarget.Global);
  }

  async removeDisabledFile(pattern: string): Promise<void> {
    const patterns = this.readConfig().disabledFiles;
    if (!patterns.includes(pattern)) { return; }
    await vscode.workspace.getConfiguration(BLINK_NAME)
      .update("disabledFiles", patterns.filter((p) => p !== pattern), vscode.ConfigurationTarget.Global);
  }

  async setActiveModel(name: string): Promise<void> {
    await vscode.workspace.getConfiguration(BLINK_NAME)
      .update("model", name, vscode.ConfigurationTarget.Global);
  }

  async addModel(model: ModelConfig): Promise<void> {
    const models = this.readConfig().models;
    await vscode.workspace.getConfiguration(BLINK_NAME)
      .update("models", [...models, model], vscode.ConfigurationTarget.Global);
  }

  async removeModel(name: string): Promise<void> {
    const config = this.readConfig();
    const c = vscode.workspace.getConfiguration(BLINK_NAME);
    await c.update("models", config.models.filter((m) => m.name !== name), vscode.ConfigurationTarget.Global);
    if (config.model === name) {
      await c.update("model", "", vscode.ConfigurationTarget.Global);
    }
  }

  onChange(cb: (config: BlinkConfig) => void) {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(BLINK_NAME)) {
          cb(this.readConfig());
        }
      }),
    );
  }
}
