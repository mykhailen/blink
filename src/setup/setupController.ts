import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { IConfigProvider, type BlinkConfig } from "../config/config.js";
import type { LlamaCppModelConfig } from "../config/models.js";
import { ILogger } from "../common/logging.js";
import { token } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";
import { IModelDownloader } from "./modelDownloader.js";
import { ICudaController } from "./cudaController.js";
import {
  RECOMMENDED_MODELS, recommendedToModelConfig, type RecommendedModel,
} from "./recommendedModels.js";
import {
  REMOTE_PRESETS, remoteModelConfig, type RemotePreset,
} from "./remotePresets.js";
import {
  buildPickEntries, customModelConfig, filenameFromSource, isUrl, type PickEntry,
} from "./modelPicker.js";

export interface ISetupController {
  /** The unified model picker: switch / download recommended / add custom / remove. */
  showPicker(): Promise<void>;
  /** One-shot "no model set up yet" notification when the registry is empty. */
  promptFirstRunIfNeeded(config: BlinkConfig): void;
}
// Merges with the interface above: one name serves as both type and token.
export const ISetupController = token<ISetupController>("setup");

interface ModelQuickPickItem extends vscode.QuickPickItem {
  entry?: PickEntry;
}

export class SetupController implements ISetupController {
  private prompted = false;

  constructor(
    @IConfigProvider private readonly config: IConfigProvider,
    @IModelDownloader private readonly downloader: IModelDownloader,
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @ILogger private readonly logger: ILogger,
    @ICudaController private readonly cuda: ICudaController,
  ) { }

  promptFirstRunIfNeeded(config: BlinkConfig): void {
    if (config.models.length > 0 || this.prompted) { return; }
    this.prompted = true;
    void vscode.window
      .showInformationMessage("blink: no completion model is set up yet.", "Set up", "Not now")
      .then((choice) => {
        if (choice === "Set up") { void this.showPicker(); }
      });
  }

  async showPicker(): Promise<void> {
    const config = this.config.readConfig();
    const entries = buildPickEntries(
      config.models, RECOMMENDED_MODELS, config.model, config.enabled,
      await this.cuda.canInstall(), REMOTE_PRESETS);
    const picked = await this.pick(this.toItems(entries));
    if (!picked) { return; }
    // When the picker was opened from the status bar, closing it restores focus
    // to the status bar item, whose tooltip then pops over the download
    // progress notification. Hand focus back to the editor first.
    await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
    if (picked.kind === "configured") {
      await this.config.setActiveModel(picked.name);
    } else if (picked.kind === "recommended") {
      await this.installRecommended(picked.rec);
    } else if (picked.kind === "custom") {
      await this.installCustom();
    } else if (picked.kind === "remote") {
      await this.installRemote(picked.preset);
    } else if (picked.kind === "cuda") {
      await this.cuda.install();
    } else if (picked.kind === "settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:lojell.blink-for-vscode");
    } else {
      await this.config.setEnabled(!picked.enabled);
    }
  }

  private toItems(entries: PickEntry[]): ModelQuickPickItem[] {
    const removeButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("trash"),
      tooltip: "Remove this model",
    };
    const items: ModelQuickPickItem[] = [];
    for (const e of entries.filter((e) => e.kind === "configured")) {
      items.push({
        entry: e,
        label: e.active ? `$(check) ${e.name}` : e.name,
        description: e.target,
        buttons: [removeButton],
      });
    }
    if (items.length > 0) {
      items.unshift({ label: "installed", kind: vscode.QuickPickItemKind.Separator });  
    }
    items.push({ label: "local models", kind: vscode.QuickPickItemKind.Separator });
    for (const e of entries.filter((e) => e.kind === "recommended")) {
      items.push({
        entry: e,
        label: `$(cloud-download) ${e.name}`,
        description: e.tags.join(" · "),
      });
    }
    items.push({
      entry: { kind: "custom" },
      label: "$(edit) Custom model…",
      description: "local .gguf path or download URL",
    });
    const remotes = entries.filter((e) => e.kind === "remote");
    if (remotes.length > 0) {
      items.push({ label: "remote APIs", kind: vscode.QuickPickItemKind.Separator });
      for (const e of remotes) {
        items.push({
          entry: e,
          label: `$(plug) ${e.preset.label}`,
          description: e.preset.description,
        });
      }
    }
    const cuda = entries.find((e) => e.kind === "cuda");
    if (cuda) {
      items.push({
        entry: cuda,
        label: "$(rocket) Enable CUDA acceleration",
        description: "NVIDIA GPU detected — ~580 MB download",
      });
    }
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    const toggle = entries.find((e) => e.kind === "toggle");
    if (toggle?.kind === "toggle") {
      items.push({
        entry: toggle,
        label: toggle.enabled ? "$(circle-slash) Disable completions" : "$(zap) Enable completions",
        description: toggle.enabled ? "blink is on" : "blink is off",
      });
    }
    items.push({
      entry: { kind: "settings" },
      label: "$(gear) Settings",
    });

    return items;
  }

  /** Show the QuickPick; resolves with the chosen entry, or undefined on dismiss/remove. */
  private pick(items: ModelQuickPickItem[]): Promise<PickEntry | undefined> {
    return new Promise((resolve) => {
      const qp = vscode.window.createQuickPick<ModelQuickPickItem>();
      qp.title = "blink: select a completion model";
      qp.placeholder = "Switch model, download a recommended one, or add your own";
      qp.items = items;
      const active = items.find((i) => i.entry?.kind === "configured" && i.entry.active);
      if (active) { qp.activeItems = [active]; }
      qp.onDidTriggerItemButton((e) => {
        qp.hide();
        const entry = e.item.entry;
        if (entry?.kind === "configured") { void this.removeModel(entry.name); }
      });
      qp.onDidAccept(() => {
        const item = qp.selectedItems[0];
        qp.hide();
        resolve(item?.entry);
      });
      qp.onDidHide(() => {
        qp.dispose();
        resolve(undefined);
      });
      qp.show();
    });
  }

  private modelsDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, "models");
  }

  private async installRecommended(rec: RecommendedModel): Promise<void> {
    const dest = path.join(this.modelsDir(), filenameFromSource(rec.uri));
    if (!(await this.downloadWithProgress(rec.name, rec.uri, dest))) { return; }
    await this.config.addModel(recommendedToModelConfig(rec, dest));
    await this.config.setActiveModel(rec.name);
  }

  private async installCustom(): Promise<void> {
    const source = await vscode.window.showInputBox({
      title: "blink: custom model",
      prompt: "Path to a local .gguf file, or an https URL to download",
      validateInput: (value) => {
        const s = value.trim();
        if (!s) { return "Enter a file path or URL"; }
        if (isUrl(s)) { return undefined; }
        return fs.existsSync(s) ? undefined : "File not found";
      },
    });
    if (!source) { return; }
    const s = source.trim();
    const taken = this.config.readConfig().models.map((m) => m.name);
    let model: LlamaCppModelConfig;
    if (isUrl(s)) {
      const dest = path.join(this.modelsDir(), filenameFromSource(s));
      model = customModelConfig(s, dest, taken);
      if (!(await this.downloadWithProgress(model.name, s, dest))) { return; }
    } else {
      model = customModelConfig(s, s, taken);
    }
    await this.config.addModel(model);
    await this.config.setActiveModel(model.name);
  }

  /** Input-box flow for a remote preset: url (unless preset) -> model id -> api key. */
  private async installRemote(preset: RemotePreset): Promise<void> {
    let apiBaseUrl = preset.apiBaseUrl ?? "";
    if (!preset.apiBaseUrl) {
      const url = await vscode.window.showInputBox({
        title: `blink: ${preset.label}`,
        prompt: "Endpoint base URL (e.g. https://host/v1); \"/completions\" is appended unless present",
        validateInput: (v) => (isUrl(v) ? undefined : "Enter an http(s) URL"),
      });
      if (!url) { return; }
      apiBaseUrl = url.trim();
    }
    const modelId = await vscode.window.showInputBox({
      title: `blink: ${preset.label}`,
      prompt: "Model id (the API `model` parameter)",
      value: preset.defaultModelId,
      validateInput: (v) => (v.trim() ? undefined : "Enter a model id"),
    });
    if (!modelId) { return; }
    const apiKey = await vscode.window.showInputBox({
      title: `blink: ${preset.label}`,
      prompt: "API key",
      password: true,
      validateInput: (v) => (v.trim() ? undefined : "Enter an API key"),
    });
    if (!apiKey) { return; }

    const taken = this.config.readConfig().models.map((m) => m.name);
    const model = remoteModelConfig(
      preset,
      { apiBaseUrl, modelId: modelId.trim(), apiKey: apiKey.trim() },
      taken,
    );
    await this.config.addModel(model);
    await this.config.setActiveModel(model.name);
    this.logger.info(`blink: added remote model ${model.name} (${model.apiBaseUrl})`);
  }

  /** Returns true on success; logs and cleans up on failure, stays quiet on user cancel. */
  private async downloadWithProgress(name: string, url: string, dest: string): Promise<boolean> {
    let cancelled = false;
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `blink: downloading ${name}`,
          cancellable: true,
        },
        async (progress, progressToken) => {
          const ac = new AbortController();
          progressToken.onCancellationRequested(() => { cancelled = true; ac.abort(); });
          let lastPct = 0;
          await this.downloader.download(url, dest, ac.signal, ({ received, total }) => {
            if (!total) { return; }
            const pct = Math.floor((received / total) * 100);
            if (pct > lastPct) {
              progress.report({
                increment: pct - lastPct,
                message: `${Math.round(received / 1e6)} / ${Math.round(total / 1e6)} MB`,
              });
              lastPct = pct;
            }
          });
        },
      );
      return true;
    } catch (err) {
      if (cancelled) {
        this.logger.info(`blink: download of ${name} cancelled`);
      } else {
        this.logger.error(`blink: model download failed: ${String(err)}`);
      }
      return false;
    }
  }

  private async removeModel(name: string): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      `Remove model "${name}" from blink?`,
      { modal: true },
      "Remove",
    );
    if (choice !== "Remove") { return; }
    const model = this.config.readConfig().models.find((m) => m.name === name);
    await this.config.removeModel(name);
    // Only delete files we downloaded into extension storage — never user files.
    if (model?.backend === "llamacpp" && model.localModelPath.startsWith(this.modelsDir())) {
      await fs.promises.rm(model.localModelPath, { force: true });
    }
    this.logger.info(`blink: removed model ${name}`);
  }
}
