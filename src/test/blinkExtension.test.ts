import * as assert from "assert";
import { BlinkExtension, type IStatusBar } from "../blinkExtension.js";
import type { BlinkConfig, IConfigProvider } from "../config/config.js";
import type { StatusStore } from "../status/statusStore.js";
import type { ICompletionEngine } from "../completion/completionEngine.js";
import type { ICompletionClientManager } from "../clients/manager.js";
import type { ILspContextProvider } from "../context/lspContext.js";
import type { IInlineCompletionItemProvider } from "../provider/inlineProvider.js";
import type { ISetupController } from "../setup/setupController.js";
import type { ICudaController } from "../setup/cudaController.js";
import type { IEditTracker } from "../edits/editTracker.js";
import type { ICommands } from "../commands.js";
import type { IActiveFileMonitor } from "../status/activeFileMonitor.js";
import type { IReleaseNotesMonitor } from "../status/releaseNotesMonitor.js";
import { globalConfig } from "./fixtures.js";

function makeFakes() {
  const calls: string[] = [];
  let onChangeCb: ((c: BlinkConfig) => void) | undefined;
  const clientToken = { id: "client" };

  const config: IConfigProvider = {
    readConfig: () => globalConfig(),
    onChange: (cb) => { onChangeCb = cb; calls.push("config.onChange"); },
    getActiveModelConfig: (c) => c.models.find((m) => m.name === c.model),
    setActiveModel: async () => { calls.push("config.setActiveModel"); },
    addModel: async () => { calls.push("config.addModel"); },
    removeModel: async () => { calls.push("config.removeModel"); },
    setEnabled: async () => { calls.push("config.setEnabled"); },
    addDisabledFile: async () => { calls.push("config.addDisabledFile"); },
    removeDisabledFile: async () => { calls.push("config.removeDisabledFile"); },
  };
  const status = {
    setConfig: () => calls.push("status.setConfig"),
    setWorking: () => {},
    setError: () => {},
  } as unknown as StatusStore;
  const statusBar: IStatusBar = { create: () => calls.push("statusBar.create") };
  const clients: ICompletionClientManager = {
    get: () => clientToken as never,
    onLoadError: () => { calls.push("clients.onLoadError"); },
    dispose: async () => { calls.push("clients.dispose"); },
  };
  const engine: ICompletionEngine = {
    setClient: () => calls.push("engine.setClient"),
    prewarm: () => calls.push("engine.prewarm"),
    complete: async () => ({ text: null, cacheHit: false }),
  };
  const inlineProvider = {
    register: () => calls.push("provider.register"),
    setEnabled: (e: boolean) => calls.push(`provider.setEnabled:${e}`),
    setModel: () => calls.push("provider.setModel"),
    lastPrompt: undefined,
    provideInlineCompletionItems: () => null,
  } as unknown as IInlineCompletionItemProvider;
  const lsp: ILspContextProvider = {
    collect: async () => [],
    clear: () => calls.push("lsp.clear"),
  };

  const setup: ISetupController = {
    showPicker: async () => { calls.push("setup.showPicker"); },
    promptFirstRunIfNeeded: () => { calls.push("setup.promptFirstRun"); },
  };

  let onInstalledCb: (() => void) | undefined;
  const cuda: ICudaController = {
    ensureLinks: async () => { calls.push("cuda.ensureLinks"); },
    offerIfApplicable: async () => { calls.push("cuda.offer"); },
    canInstall: async () => false,
    install: async () => { calls.push("cuda.install"); },
    onInstalled: (cb) => { onInstalledCb = cb; calls.push("cuda.onInstalled"); },
  };

  const edits: IEditTracker = {
    register: () => { calls.push("edits.register"); },
    record: () => {},
    select: () => [],
  };

  const commands: ICommands = {
    register: () => { calls.push("commands.register"); },
  };

  const activeFile: IActiveFileMonitor = {
    register: () => { calls.push("activeFile.register"); },
  };

  const releaseNotes: IReleaseNotesMonitor = {
    register: () => { calls.push("releaseNotes.register"); },
    markSeen: () => { calls.push("releaseNotes.markSeen"); },
    openChangelog: async () => {},
  };

  const ext = new BlinkExtension(config, status, statusBar, clients, engine, inlineProvider, lsp, setup, cuda, edits, commands, activeFile, releaseNotes);
  return { ext, calls, fire: (c: BlinkConfig) => onChangeCb?.(c), fireInstalled: () => onInstalledCb?.() };
}

suite("BlinkExtension", () => {
  test("start() registers provider, status bar, and config subscription, then inits", () => {
    const { ext, calls } = makeFakes();
    ext.start();
    assert.ok(calls.includes("provider.register"));
    assert.ok(calls.includes("statusBar.create"));
    assert.ok(calls.includes("edits.register"));
    assert.ok(calls.includes("commands.register"));
    assert.ok(calls.includes("activeFile.register"));
    assert.ok(calls.includes("releaseNotes.register"));
    assert.ok(calls.includes("clients.onLoadError"));
    assert.ok(calls.includes("config.onChange"));
    assert.ok(calls.includes("status.setConfig"));
    assert.ok(calls.includes("engine.setClient"));
    assert.ok(calls.includes("provider.setModel"));
    assert.ok(calls.includes("provider.setEnabled:true"));
    assert.ok(calls.includes("cuda.ensureLinks"));
    assert.ok(calls.includes("cuda.onInstalled"));
    assert.ok(calls.includes("cuda.offer"));
  });

  test("a config change re-inits status, client, model, enabled, and clears lsp", () => {
    const { ext, calls, fire } = makeFakes();
    ext.start();
    calls.length = 0;
    fire(globalConfig({ enabled: false }));
    assert.deepStrictEqual(
      calls,
      ["status.setConfig", "engine.setClient", "provider.setModel", "provider.setEnabled:false", "lsp.clear", "cuda.offer"],
    );
  });

  test("a CUDA install disposes the active client and re-inits", () => {
    const { ext, calls, fireInstalled } = makeFakes();
    ext.start();
    calls.length = 0;
    fireInstalled();
    assert.ok(calls.includes("clients.dispose"));
    assert.ok(calls.includes("status.setConfig"));
    assert.ok(calls.includes("engine.setClient"));
  });

  test("start() gives the setup controller a first-run chance", () => {
    const { ext, calls } = makeFakes();
    ext.start();
    assert.ok(calls.includes("setup.promptFirstRun"));
  });

  test("dispose() tears down the client manager", async () => {
    const { ext, calls } = makeFakes();
    await ext.dispose();
    assert.ok(calls.includes("clients.dispose"));
  });
});
