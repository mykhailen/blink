import * as vscode from "vscode";
import { IConfigProvider } from "./config/config.js";
import { Metrics } from "./metrics.js";
import { ILogger } from "./common/logging.js";
import { ISetupController } from "./setup/setupController.js";
import { DID_ACCEPT_COMMAND } from "./provider/inlineProvider.js";
import { token, Inject } from "./di/container.js";
import { ExtensionContext } from "./di/vscodeTokens.js";
import { DoubleTapDetector } from "./provider/doubleTap.js";
import { IReleaseNotesMonitor } from "./status/releaseNotesMonitor.js";

export interface ICommands {
  register(): void;
}

// Merges with the interface above: one name serves as both type and token.
export const ICommands = token<ICommands>("commands");

/** Registers all palette/internal commands into the extension subscriptions. */
export class Commands implements ICommands {
  private readonly escapeTaps = new DoubleTapDetector();

  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @IConfigProvider private readonly config: IConfigProvider,
    @ISetupController private readonly setup: ISetupController,
    @Inject(Metrics) private readonly metrics: Metrics,
    @ILogger private readonly log: ILogger,
    @IReleaseNotesMonitor private readonly releaseNotes: IReleaseNotesMonitor,
  ) {}

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand("blink.switchModel", () => this.setup.showPicker()),
      vscode.commands.registerCommand("blink.enable", () => this.config.setEnabled(true)),
      vscode.commands.registerCommand("blink.disable", () => this.config.setEnabled(false)),
      vscode.commands.registerCommand("blink.toggle", () => this.toggle()),
      vscode.commands.registerCommand("blink.escapeTap", () => {
        if (this.escapeTaps.tap(Date.now())) { void this.toggle(); }
      }),
      vscode.commands.registerCommand("blink.disableForFileType", (pattern: unknown) => {
        if (typeof pattern === "string" && pattern) { void this.config.addDisabledFile(pattern); }
      }),
      vscode.commands.registerCommand("blink.enableForFileType", (pattern: unknown) => {
        if (typeof pattern === "string" && pattern) { void this.config.removeDisabledFile(pattern); }
      }),
      vscode.commands.registerCommand(DID_ACCEPT_COMMAND, () => this.metrics.recordAccepted()),
      vscode.commands.registerCommand("blink.showMetrics", () => this.log.info(this.metrics.format())),
      vscode.commands.registerCommand("blink.markNotesSeen", () => this.releaseNotes.markSeen()),
      vscode.commands.registerCommand("blink.openChangelog", () => this.releaseNotes.openChangelog()),
    );
  }

  private toggle(): Promise<void> {
    return this.config.setEnabled(!this.config.readConfig().enabled);
  }
}
