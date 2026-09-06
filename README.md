# Blink — Local AI Code Completions

**AI ghost text that appears in a Blink — running entirely on your machine.**

Blink brings lightning-fast inline completions to VS Code, **local-first** and
**bring-your-own-key**. Run a GGUF code model **in-process** via
[llama.cpp](https://github.com/ggml-org/llama.cpp) — no server, no account, no
cloud, no subscription — or point Blink at any OpenAI-compatible
`/v1/completions` endpoint with your own key, including **Mistral Codestral**
via its native FIM API.

![Blink completing code in VS Code](media/blink.gif)

## Quick start

1. Install Blink and open any code file.
2. Run **Blink: Select Model…** (Command Palette, or click the Blink status
   bar item) and pick a recommended model — Blink downloads it with progress.
3. Type. Ghost text appears; press `Tab` to accept.

That's it — no API key, no account, no setup beyond picking a model. To use
a remote endpoint instead, pick one under **remote APIs** in the same picker —
**Mistral Codestral** (just paste your API key) or any **OpenAI-compatible
endpoint** — or add an entry to `blink.models` by hand (below).

## Why Blink?

- **Private by default** — with a local model, your code never leaves your
  machine. No telemetry, ever.
- **Genuinely fast** — the model runs inside VS Code's process with native
  fill-in-the-middle (FIM), not chat prompting over the network.
- **Yours to configure** — local GGUF or any OpenAI-compatible endpoint,
  switchable in two clicks.

## Features

- **Inline ghost text** as you type, accepted with `Tab` — driven by native
  fill-in-the-middle (FIM), not chat prompting.
- **Local models, in-process** — pick a recommended Qwen2.5-Coder GGUF
  (0.5B–7B) and Blink downloads and runs it inside VS Code. Nothing leaves
  your machine.
- **BYOK remote option** — any OpenAI-compatible completions endpoint (vLLM,
  llama-server, TGI, a cloud provider) with your own key, plus a one-minute
  **Mistral Codestral** preset in the model picker.
- **Model registry** — configure several models once, switch instantly with
  **Blink: Select Model…** from the palette or the status bar.
- **GPU out of the box** — Vulkan on Windows/Linux x64, Metal on Apple
  Silicon; CPU works everywhere. On NVIDIA machines Blink offers a one-click
  **CUDA** download (~580 MB) for peak throughput.
- **Status bar control** — live state plus hover actions: settings, model
  switch, enable/disable.
- **Toggle in a blink** — double-press `Escape` in the editor to turn
  completions on or off (single `Escape` keeps its normal behavior — it only
  counts when there's nothing to dismiss). Also **Blink: Toggle Inline
  Completions** in the Command Palette.

## Requirements

- **RAM ≈ model size**: ~0.7 GB for the smallest recommended quant, ~4.7 GB
  for the 7B. A GPU is optional but recommended (Vulkan / Metal).
- **Local models must support FIM** (fill-in-the-middle). Blink rejects GGUFs
  without infill tokens at load — base *coder* models work (Qwen2.5-Coder);
  instruct/chat models usually don't.
- Platforms: Windows x64 & arm64, Linux x64 & arm64, macOS Intel & Apple
  Silicon.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `blink.enabled` | `true` | Master switch for inline completions. |
| `blink.enableInChat` | `false` | Also complete inside chat prompt inputs (Copilot Chat, inline/terminal chat). The terminal itself is never completed by blink; ghost text there comes from your shell or Copilot. |
| `blink.enableInCommitMessage` | `false` | Also complete inside the Source Control commit message box. |
| `blink.disabledSchemes` | `[]` | Extra document URI schemes to stay quiet in (e.g. `vscode-interactive-input`). Always wins over the two checkboxes above. [Built-in schemes](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/network.ts). |
| `blink.model` | `""` | Name of the active entry in `blink.models`. |
| `blink.models` | `[]` | The model registry (examples below). |

One registry entry per model; the two backends:

```jsonc
"blink.models": [
  {
    "name": "local-qwen",                // select with "Blink.model": "local-qwen"
    "backend": "llamacpp",
    "modelId": "qwen2.5-coder",
    "localModelPath": "C:/models/Qwen2.5-Coder-3B-Q6_K.gguf",
    "gpu": "auto"                        // auto | vulkan | metal | off
  },
  {
    "name": "my-endpoint",
    "backend": "openai",
    "modelId": "qwen2.5-coder-7b",       // the API "model" param
    "apiBaseUrl": "https://my-host/v1",
    "apiKey": "sk-…",
    "fim": "<|fim_prefix|>"              // the model family's FIM token
  },
  {
    "name": "mistral-codestral",         // or add it from the picker: remote APIs
    "backend": "openai",
    "modelId": "codestral-2508",
    "apiBaseUrl": "https://api.mistral.ai/v1/fim/completions",
    "apiKey": "…",                       // console.mistral.ai → API keys
    "promptStyle": "prefix-suffix"       // Mistral templates FIM server-side
  }
]
```

Two prompt styles for the `openai` backend:

- **`raw`** (default) — Blink builds one FIM-templated prompt locally (using
  the `fim` token) and sends it as `prompt`. For self-hosted servers that pass
  raw prompts to the model: vLLM, llama-server, TGI.
- **`prefix-suffix`** — Blink sends the code before the cursor as `prompt` and
  the code after it as `suffix`, and the endpoint applies the model's FIM
  template itself. This is what **Mistral Codestral**
  (`https://api.mistral.ai/v1/fim/completions`) expects; `fim` is ignored.

`apiBaseUrl` gets `/completions` appended unless it already ends with it, so
both `https://host/v1` and a full endpoint URL work. Remote requests time out
after 10 s by default (`requestTimeoutMs` overrides per entry).

## Privacy

- **Local models:** everything runs and stays on your machine.
- **OpenAI-compatible backend:** the assembled prompt (code around your
  cursor, plus your editor's own completion suggestions for that spot) is
  sent **only to the endpoint you configure**. No other network traffic,
  **no telemetry**.
- Your API key lives in VS Code settings (`blink.models`). In Restricted
  Mode the model registry is read from **user** settings only, so an
  untrusted workspace cannot redirect it. Moving keys to VS Code
  SecretStorage is on the roadmap.

## Known limitations (v0.1)

- **CUDA is a separate download** — the VSIX ships Vulkan (which already
  accelerates NVIDIA); Blink offers the ~580 MB CUDA binaries when it detects
  an NVIDIA GPU, or via **Blink: Select Model…**.
- **No ollama backend yet** — point the `openai` backend at any
  OpenAI-compatible server instead.
- Completions only — Blink is not a chat assistant.
- Prompt caching, latency tuning, and richer context sources (recent edits,
  LSP signatures) are in active development.

## License

[MIT](LICENSE)
