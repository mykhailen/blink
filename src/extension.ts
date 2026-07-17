import * as vscode from "vscode";
import * as path from "node:path";
import { BlinkConfigProvider, IConfigProvider } from "./config/config.js";
import { CompletionClientManager, ICompletionClientManager } from "./clients/manager.js";
import { BackendRegistry, IBackendRegistry } from "./clients/backends.js";
import { CompletionCache } from "./cache.js";
import { CompletionEngine, ICompletionEngine } from "./completion/completionEngine.js";
import { Metrics } from "./metrics.js";
import { EditTracker, IEditTracker } from "./edits/editTracker.js";
import { LspContextProvider, ILspContextProvider } from "./context/lspContext.js";
import { CompletionComposer, ICompletionComposer } from "./context/composer.js";
import { BlinkInlineProvider, IInlineCompletionItemProvider } from "./provider/inlineProvider.js";
import { StatusStore } from "./status/statusStore.js";
import { BlinkStatusBar } from "./status/statusBar.js";
import { ActiveFileMonitor, IActiveFileMonitor } from "./status/activeFileMonitor.js";
import { ReleaseNotesMonitor, IReleaseNotesMonitor } from "./status/releaseNotesMonitor.js";
import { Logger, ILogger } from "./common/logger.js";
import { BlinkExtension, IStatusBar } from "./blinkExtension.js";
import { FimTemplates } from "./completion/fimTemplates.js";
import { ModelDownloader, IModelDownloader } from "./setup/modelDownloader.js";
import { SetupController, ISetupController } from "./setup/setupController.js";
import { Commands, ICommands } from "./commands.js";
import { CudaInstaller, ICudaInstaller } from "./setup/cudaInstaller.js";
import { CudaController, ICudaController } from "./setup/cudaController.js";
import { Container } from "./di/container.js";
import { ExtensionContext } from "./di/vscodeTokens.js";

let blink: BlinkExtension | undefined;

export function activate(context: vscode.ExtensionContext) {
  const logger = new Logger(context);
  try {
    const c = new Container();
    // Value-configured deps register as factories; everything else declares
    // its own wiring (static inject, plus provides when an interface fronts
    // it) and registers by class.
    c.register(ExtensionContext, () => context);
    c.register(ILogger, () => logger);
    c.register(CompletionCache, () => new CompletionCache(100));
    c.register(IConfigProvider, BlinkConfigProvider);
    c.register(StatusStore);
    c.register(IStatusBar, BlinkStatusBar);
    c.register(IActiveFileMonitor, ActiveFileMonitor);
    c.register(IReleaseNotesMonitor, ReleaseNotesMonitor);
    c.register(Metrics);
    c.register(IEditTracker, EditTracker);
    c.register(ILspContextProvider, LspContextProvider);
    c.register(IBackendRegistry, BackendRegistry);
    c.register(ICompletionClientManager, CompletionClientManager);
    c.register(FimTemplates);
    c.register(ICompletionEngine, CompletionEngine);
    c.register(ICompletionComposer, CompletionComposer);
    c.register(IInlineCompletionItemProvider, BlinkInlineProvider);
    c.register(IModelDownloader, ModelDownloader);
    c.register(ICudaInstaller, (cc) => new CudaInstaller({
      storageDir: path.join(context.globalStorageUri.fsPath, "cuda"),
      extensionRoot: context.extensionPath,
      downloader: cc.get(IModelDownloader),
    }));
    c.register(ICudaController, CudaController);
    c.register(ISetupController, SetupController);
    c.register(ICommands, Commands);
    c.register(BlinkExtension);

    blink = c.get(BlinkExtension);
    blink.start();

    logger.info("blink activated");
  } catch (error) {
    logger.error('Error activating Blink extension:', JSON.stringify(error));
  }
}

export function deactivate() {
  const disposing = blink?.dispose();
  blink = undefined;
  return disposing;
}
