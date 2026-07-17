# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**blink** is a VS Code extension that provides **lightning-fast inline AI code
completions** (ghost text) with **BYOK** (bring-your-own-key). Completions come
from a configurable **model registry** (`blink.models[]`); `blink.model` names
the active entry. Each model declares a **backend**:

- **`llamacpp`** (default) — an in-process GGUF code model via **node-llama-cpp**,
  using native **FIM** (fill-in-the-middle). Default model: a Qwen2.5-Coder base.
- **`openai`** — any OpenAI-compatible `/v1/completions` endpoint. Per-model
  `promptStyle: "prefix-suffix"` supports server-side-templated FIM endpoints
  (e.g. Mistral codestral `/v1/fim/completions`) by sending `prompt` + `suffix`
  instead of one locally templated prompt.
- **`ollama`** — config shape only; the client is not implemented yet.

The completion pipeline: gather context (current file prefix/suffix, recent
edits, optional LSP signatures) → build a FIM prompt → call the provider →
post-process → show as an `InlineCompletionItem`. A status bar item reflects live
state (idle / working / disabled / error) with a rich hover tooltip.

## Build & test

```bash
npm install
npm run check-types     # tsc --noEmit
npm run lint            # eslint src
node esbuild.js         # bundle to dist/extension.js (or: npm run compile)
npm test                # compiles to out/ then runs the VS Code test host (mocha)
npm run build:icons     # regenerate media/blink.woff from media/blink.svg (rarely needed)
npm run build:icon-png  # regenerate media/icon.png (marketplace icon) from media/blink.svg
npm run package:vsix -- <target>   # per-platform VSIX into dist-vsix/ (see docs/RELEASING.md)
```

Run the extension with **F5** (Extension Development Host). Some behavior — the
real local model, the status bar glyph, the tooltip — is only verifiable at F5,
not in the unit suite.

## Layout

```
src/
  extension.ts              activate/deactivate; composition root (registers classes/factories, resolves BlinkExtension)
  blinkExtension.ts         BlinkExtension composition root: wires + registers, re-inits on config change
  constants.ts              BLINK_NAME
  cache.ts                  LRU + reuse/negative cache (pure)
  metrics.ts                latency / hit-rate counters (pure)
  common/
    logging.ts              ILogger seam + merged ILogger token (pure — importable by logic modules)
    logger.ts               Logger concrete (vscode output channel; error also pops a vscode message)
  di/
    container.ts            Token<T> (callable as param decorator) + Inject(Class) + Container: token->class binding, class-as-own-key, or factory registration; lazy singletons, cycle detection (pure)
    vscodeTokens.ts         tokens for vscode-owned types (ExtensionContext)
  config/
    config.ts               BlinkConfig (model registry) + IConfigProvider/BlinkConfigProvider (the single settings reader)
    models.ts               ModelConfig per-backend union + resolveActiveModel/isModelConfigured/modelTarget (pure)
    fileBlacklist.ts        disabledFiles glob matcher + patternForFile (pure)
  clients/
    types.ts                CompletionClient (engine seam) + ManagedClient (setConfig/onLoadError/dispose)
    backends.ts             BackendRegistry(logger): backend -> client factory map (no switch); throws for ollama
    manager.ts              CompletionClientManager: single-active holder; delegates creation to the registry; forwards onLoadError
    openai/openAiClient.ts  OpenAICompletionClient (deps-only ctor; setConfig applies the model; injectable fetch)
    llamacpp/localLlamaClient.ts  LocalLlamaCompletionClient + LlamaEngine/EngineLoader seam; setConfig resets engine on path/gpu change
    llamacpp/realLlamaEngine.ts   the ONLY file importing node-llama-cpp (dynamic import; no unit test)
    ollama/                 (empty — config supported, client not yet implemented)
  completion/
    contextAssembler.ts     prefix/suffix/header windows (pure)
    fimTemplates.ts         per-model FIM token registry (pure)
    promptBuilder.ts        context + format -> { prompt, stop } (pure)
    postProcess.ts          strip stop tokens, dedupe suffix overlap (pure)
    completionEngine.ts     ICompletionEngine: per-request orchestrator (no vscode)
  context/
    identifiers.ts, hoverSignature.ts, lspContext.ts   LSP-derived context
    composer.ts             ICompletionComposer: prefix/suffix split + completions-as-context experiment (recent-edits/LSP gating present but unwired)
  edits/
    editTracker.ts          recent-edit snippets (pure) + IEditTracker
    editTrackerAdapter.ts   onDidChangeTextDocument subscription (vscode)
  provider/
    inlineProvider.ts       BlinkInlineProvider: thin InlineCompletionItemProvider adapter
    debounce.ts, trigger.ts triggering / keystroke-burst control (pure)
    doubleTap.ts            DoubleTapDetector: double-Escape toggle window (pure)
  setup/
    recommendedModels.ts    curated FIM-capable model list (pure data)
    remotePresets.ts        remote openai-backend presets (generic + Mistral) + remoteModelConfig (pure)
    modelPicker.ts          merge configured+recommended -> pick entries; name/config inference (pure)
    modelDownloader.ts      IModelDownloader: streaming download with progress/abort (node-only)
    setupController.ts      first-run prompt + unified model QuickPick (vscode)
  status/
    statusStore.ts          single source of truth for status (pure, getDisplay())
    tooltip.ts              hover tooltip markdown (pure)
    statusBar.ts            BlinkStatusBar bound to the store (vscode)
    activeFileMonitor.ts    syncs active editor + disabledFiles into the store (vscode)
media/                      blink*.svg glyph sources + generated blink.woff (status bar icon font) + icon.png (store icon)
scripts/build-icon-font.mjs SVG -> woff generator
scripts/build-icon-png.mjs  SVG -> 256x256 PNG store icon
scripts/package-vsix.mjs    per-target VSIX: installs the target's @node-llama-cpp variants, prunes the rest, vsce package
docs/superpowers/           design specs + implementation plans
docs/RELEASING.md           manual release checklist (publisher, PAT, placeholders, smoke test)
```

## Architecture conventions

- **Pure core, thin vscode adapters.** Logic-bearing modules (`CompletionEngine`,
  prompt/context/cache/status store/metrics/tooltip) must
  **not** import `vscode` — they take plain values and are unit-tested. Adapters
  only: `extension.ts`, `blinkExtension.ts`, `provider/inlineProvider.ts`,
  `status/statusBar.ts`, `config/config.ts`, `common/logger.ts`,
  `edits/editTrackerAdapter.ts`, `context/lspContext.ts`, `realLlamaEngine.ts`,
  `setup/setupController.ts`.
- **DI composition root.** `activate()` builds a `Container` (`src/di/`) and
  registers each collaborator in one of three forms: **bind a token to a
  class** for interface seams (`c.register(IConfigProvider,
  BlinkConfigProvider)` — the binding lives in the root, not the class),
  **register a concrete class as its own key** (`c.register(StatusStore)`),
  or **register a factory** for value-configured deps (cache size, the
  pre-built logger, the raw extension context). Constructor params declare
  their keys with **parameter decorators**: a token is its own decorator
  (`@ILogger private readonly log: ILogger`); concrete-class deps use
  `@Inject(StatusStore)` (a class can't be its own decorator — calling it
  without `new` throws). Registration validates decorator coverage at
  activation, but wrong-token mistakes surface only at runtime (parameter
  decorators carry no type link — accepted trade-off, see the DI spec).
  Injection keys are **merged-name tokens** for interfaces
  (`const ILogger = token<ILogger>(...)` next to the interface — one name is
  both type and token; vscode-owned types in `di/vscodeTokens.ts`) or **the
  class itself** for concretes (`StatusStore`, `Metrics`, `CompletionCache`).
  `activate()` then resolves
  `BlinkExtension` (`c.get(BlinkExtension)`), which registers
  the provider + status bar and re-inits (status, active client, enabled, lsp
  cache) on each config change. Classes know their tokens, never the container
  (no class imports `Container`; constructor injection everywhere). Stateful/IO
  collaborators sit behind interfaces (`IConfigProvider`, `ICompletionEngine`,
  `IContextGatherer`, `ICompletionClientManager`, `IEditTracker`,
  `ILspContextProvider`, `IInlineCompletionItemProvider`, `IStatusBar`); pure
  transformers stay free functions.
- **Model registry + backend seam.** Config is a `models[]` registry (per-backend
  `ModelConfig` union) + a `blink.model` selector naming the active entry.
  `BlinkExtension.init` resolves the active model, validates it
  (`isModelConfigured`), and builds a client via `CompletionClientManager.get(model)`,
  asking the `BackendRegistry` to `create(model.backend)` — a factory map, no
  switch. The manager is a **single-active holder**: it keeps one client, recreates
  it via the registry only when the backend changes, and applies the model via
  `ManagedClient.setConfig`. The active model travels in `CompletionRequest.model`
  so the engine (cache/FIM via `modelId`) and gatherer (context gate via
  `promptFormat`) read it. Every client implements `CompletionClient`
  (`complete(...) => Promise<string>`) and never throws (returns `""`). Add a
  backend by adding a client + one registry factory entry. Model-load failures
  surface twice: the client calls `logger.error` (logs + vscode popup) and
  signals `manager.onLoadError`, which `BlinkExtension.start()` wires to
  `status.setError`.
- **node-llama-cpp is isolated** behind `realLlamaEngine.ts` and loaded via
  dynamic `import()`, so activation never pays the native cost and a load failure
  degrades to "no completions" (never crashes).
- **Config is read in one place** (`config/config.ts`, behind `IConfigProvider`).
  Everything else takes a `BlinkConfig`.

## Context & pipeline state (v0.1 ships the experiment as-is)

The completion pipeline is mid-experiment (see the publishing spec's Decision
update): `context/composer.ts` prepends IDE completion items to the FIM prefix
(completions-as-context), while debounce/trigger gating, metrics recording,
the completion cache, context windowing, postProcess, and the recent-edits/LSP
gating are present but commented out. Their settings were removed from
package.json until re-wired (`config.ts` still reads them with defaults). FIM
template selection is client-driven via `getFimPrefix()` (llamacpp auto-detects
from the GGUF; openai uses the model entry's `fim`).

Switch, download, add, or remove models from the palette: **blink: Select
Model…** (also offered via a first-run notification and the status bar when no
models are configured yet). `blink.showMetrics` / `blink.showLastPrompt` are
registered but hidden from the palette (metrics records accepts only; the last
prompt is never set).

Completions can be turned off per file type via the `blink.disabledFiles`
glob blacklist (default markdown); the status bar tooltip offers
"Disable for *.ts" / "Enable for *.md" for the active file
(`blink.disableForFileType` / `blink.enableForFileType`, tooltip-only).

**Double-Escape toggles completions**: a plain `escape` keybinding (gated by a
when-clause so it only matches when Escape would otherwise be a no-op — no
suggest/find/rename widget, no selection, no snippet, no ghost text) invokes
the palette-hidden `blink.escapeTap` command; two taps within 400 ms
(`provider/doubleTap.ts`, pure, reset-on-fire) flip `blink.enabled` via
`setEnabled`, same as the palette-visible `blink.toggle`. NOT a VS Code chord —
`"escape escape"` would put VS Code into chord-wait mode and break single
Escape editor-wide. Extensions that claim Escape (e.g. VSCodeVim) may conflict;
that's an accepted trade-off.

## Gotchas

- **Local model must support FIM:** `realLlamaEngine` rejects a GGUF without
  FIM/infill tokens (`infillSupported`) at load with a warning — point a
  llamacpp model's `localModelPath` at a code model (e.g. qwen2.5-coder).
- **Ollama is internal-only:** the settings schema no longer offers `ollama`
  (hidden for v0.1), but the internal `ModelConfig` union keeps it and the
  `BackendRegistry` throws "not implemented" if one is created (hand-typed
  config still reaches it). `BlinkExtension.init` catches that and shows
  `ollama backend unavailable` in the status bar (provider stays disabled);
  switching to a valid model recovers. To enable: implement
  `OllamaCompletionClient`, register a factory, re-add the enum value +
  `baseUrl` property in package.json.
- **Node16 modules:** relative imports MUST use `.js` extensions (e.g.
  `import { x } from "./y.js"`), in both src and tests.
- **DI uses legacy decorators:** `experimentalDecorators` is on in tsconfig
  because parameter decorators don't exist in TC39 standard decorators.
  esbuild supports the transform (but NOT `emitDecoratorMetadata` — tokens
  are always explicit). A wrong `@Token` on a param is NOT a compile error;
  it fails at runtime. A missing decorator throws at registration.
- **Tests run from `out/`:** `npm test` compiles src→`out/` but `tsc` does not
  delete stale outputs. After renaming/removing a test, `rm -rf out` before
  `npm test` or you'll run **ghost tests**.
- **`skipLibCheck` is on** because node-llama-cpp ships `.d.ts` files that don't
  pass strict lib-checking. Don't remove it.
- **Status bar can't render raw SVG** — only codicons (`$(name)`) or the
  contributed icon-font glyphs `$(blink-logo)` / `$(blink-issue)` /
  `$(blink-disabled)`. The hover tooltip is a
  `MarkdownString`: text + `command:` links only, no input controls.
- **Commit style:** end commit messages with the repo's
  `Co-Authored-By: Claude ...` trailer. Work on a feature branch, not `main`.

## Status

Pre-1.0; no remote yet. Completion-quality work (rounds 1–3b + local-FIM guard +
Show Last Prompt), the DI architecture (BlinkExtension root + interface seams),
the per-backend `clients/` split, multi-model configuration (model registry +
`switchModel`), and the backend registry (single-active client manager) are all
on `main`. Marketplace publishing prep (v0.1: per-platform VSIXs, store assets,
CI release pipeline; pipeline shipped as-is mid-experiment) lives on
`release-prep`. Design specs and implementation plans live under
`docs/superpowers/`.
