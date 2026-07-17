import * as assert from "assert";
import {
  buildPickEntries, customModelConfig, filenameFromSource,
  inferNameFromSource, isUrl, uniqueName,
} from "../setup/modelPicker.js";
import { RECOMMENDED_MODELS } from "../setup/recommendedModels.js";
import { REMOTE_PRESETS } from "../setup/remotePresets.js";
import { llamaModel } from "./fixtures.js";

suite("modelPicker", () => {
  suite("buildPickEntries", () => {
    test("configured first (active marked), then recommended, then custom and toggle", () => {
      const models = [llamaModel({ name: "mine" }), llamaModel({ name: "other" })];
      const entries = buildPickEntries(models, RECOMMENDED_MODELS, "mine", true);
      assert.deepStrictEqual(
        entries.map((e) => e.kind),
        ["configured", "configured", ...RECOMMENDED_MODELS.map(() => "recommended"), "custom", "toggle"],
      );
      const first = entries[0];
      assert.ok(first.kind === "configured" && first.active);
      const second = entries[1];
      assert.ok(second.kind === "configured" && !second.active);
    });

    test("a recommended entry already configured is not repeated", () => {
      const taken = RECOMMENDED_MODELS[0].name;
      const entries = buildPickEntries([llamaModel({ name: taken })], RECOMMENDED_MODELS, taken, true);
      const recNames = entries.filter((e) => e.kind === "recommended").map((e) => e.name);
      assert.ok(!recNames.includes(taken));
      assert.strictEqual(recNames.length, RECOMMENDED_MODELS.length - 1);
    });

    test("configured rows expose a display target", () => {
      const entries = buildPickEntries([llamaModel({ localModelPath: "C:\\models\\m.gguf" })], [], "x", true);
      const e = entries[0];
      assert.ok(e.kind === "configured");
      assert.strictEqual(e.target, "m.gguf");
    });

    test("a cuda entry appears between custom and toggle only when available", () => {
      const withCuda = buildPickEntries([], [], "", true, true);
      assert.deepStrictEqual(withCuda.map((e) => e.kind), ["custom", "cuda", "toggle"]);
      const without = buildPickEntries([], [], "", true, false);
      assert.deepStrictEqual(without.map((e) => e.kind), ["custom", "toggle"]);
      const defaulted = buildPickEntries([], [], "", true);
      assert.deepStrictEqual(defaulted.map((e) => e.kind), ["custom", "toggle"]);
    });

    test("remote presets appear after custom and before cuda/toggle", () => {
      const entries = buildPickEntries([], [], "", true, true, REMOTE_PRESETS);
      assert.deepStrictEqual(
        entries.map((e) => e.kind),
        ["custom", ...REMOTE_PRESETS.map(() => "remote"), "cuda", "toggle"],
      );
      const remote = entries.find((e) => e.kind === "remote");
      assert.ok(remote?.kind === "remote" && remote.preset === REMOTE_PRESETS[0]);
    });

    test("the toggle entry carries the current enabled state", () => {
      const on = buildPickEntries([], [], "", true).find((e) => e.kind === "toggle");
      assert.ok(on?.kind === "toggle" && on.enabled === true);
      const off = buildPickEntries([], [], "", false).find((e) => e.kind === "toggle");
      assert.ok(off?.kind === "toggle" && off.enabled === false);
    });
  });

  suite("source parsing", () => {
    test("isUrl", () => {
      assert.strictEqual(isUrl("https://host/x.gguf"), true);
      assert.strictEqual(isUrl("HTTP://host/x.gguf"), true);
      assert.strictEqual(isUrl("C:\\models\\x.gguf"), false);
      assert.strictEqual(isUrl("/home/u/x.gguf"), false);
    });

    test("filenameFromSource strips query strings and decodes", () => {
      assert.strictEqual(
        filenameFromSource("https://hf.co/r/resolve/main/Model-Q6_K.gguf?download=true"),
        "Model-Q6_K.gguf",
      );
      assert.strictEqual(filenameFromSource("C:\\models\\My Model.gguf"), "My Model.gguf");
      assert.strictEqual(filenameFromSource("/home/u/models/m.gguf"), "m.gguf");
    });

    test("inferNameFromSource lowercases and drops .gguf", () => {
      assert.strictEqual(
        inferNameFromSource("https://hf.co/r/resolve/main/Qwen2.5-Coder-3B-Q6_K.gguf?download=true"),
        "qwen2.5-coder-3b-q6_k",
      );
      assert.strictEqual(inferNameFromSource("C:\\m\\MyModel.GGUF"), "mymodel");
    });

    test("uniqueName suffixes on collision", () => {
      assert.strictEqual(uniqueName("m", []), "m");
      assert.strictEqual(uniqueName("m", ["m"]), "m-2");
      assert.strictEqual(uniqueName("m", ["m", "m-2"]), "m-3");
    });
  });

  suite("customModelConfig", () => {
    test("infers name from source, applies silent defaults", () => {
      const m = customModelConfig("C:\\models\\My-Model.gguf", "C:\\models\\My-Model.gguf", []);
      assert.deepStrictEqual(m, {
        name: "my-model",
        backend: "llamacpp",
        modelId: "my-model",
        localModelPath: "C:\\models\\My-Model.gguf",
        maxTokens: 256,
        requestTimeoutMs: 3000,
        fim: "<|fim_prefix|>",
      });
    });

    test("url source: name from url, path from destination", () => {
      const m = customModelConfig("https://hf.co/r/resolve/main/X.gguf?download=true", "C:\\store\\X.gguf", ["x"]);
      assert.strictEqual(m.name, "x-2");
      assert.strictEqual(m.localModelPath, "C:\\store\\X.gguf");
    });
  });
});
