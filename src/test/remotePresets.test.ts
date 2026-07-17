import * as assert from "assert";
import { REMOTE_PRESETS, remoteModelConfig } from "../setup/remotePresets.js";

const generic = REMOTE_PRESETS[0];
const mistral = REMOTE_PRESETS[1];

suite("remotePresets", () => {
  test("ships a generic openai preset and a mistral codestral preset", () => {
    assert.strictEqual(generic.apiBaseUrl, undefined);
    assert.strictEqual(generic.promptStyle, "raw");
    assert.strictEqual(mistral.apiBaseUrl, "https://api.mistral.ai/v1/fim/completions");
    assert.strictEqual(mistral.defaultModelId, "codestral-2508");
    assert.strictEqual(mistral.promptStyle, "prefix-suffix");
  });

  test("generic preset: input url wins, name is the model id, raw style", () => {
    const m = remoteModelConfig(
      generic,
      { apiBaseUrl: "https://api.example.com/v1", modelId: "gpt-4o-mini", apiKey: "sk-1" },
      [],
    );
    assert.deepStrictEqual(m, {
      name: "gpt-4o-mini",
      backend: "openai",
      modelId: "gpt-4o-mini",
      apiBaseUrl: "https://api.example.com/v1",
      apiKey: "sk-1",
      promptStyle: "raw",
      maxTokens: 256,
      requestTimeoutMs: 10000,
      fim: "",
    });
  });

  test("mistral preset: fixed url wins over input, name is prefixed, prefix-suffix style", () => {
    const m = remoteModelConfig(
      mistral,
      { apiBaseUrl: "https://should-be-ignored", modelId: "codestral-2508", apiKey: "k" },
      [],
    );
    assert.strictEqual(m.apiBaseUrl, "https://api.mistral.ai/v1/fim/completions");
    assert.strictEqual(m.name, "mistral-codestral-2508");
    assert.strictEqual(m.promptStyle, "prefix-suffix");
  });

  test("name collisions get a numeric suffix", () => {
    const m = remoteModelConfig(
      generic,
      { apiBaseUrl: "https://x/v1", modelId: "m", apiKey: "k" },
      ["m", "m-2"],
    );
    assert.strictEqual(m.name, "m-3");
  });
});
