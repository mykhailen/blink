import * as assert from "assert";
import { CompletionEngine, type CompletionRequest } from "../completion/completionEngine.js";
import { CompletionCache } from "../cache.js";
import { FimTemplates } from "../completion/fimTemplates.js";
import type { CompletionClient } from "../clients/types.js";

function fakeClient(
  text: string,
  opts: { calls?: { n: number }; fimPrefix?: string | null } = {},
): CompletionClient {
  return {
    async complete() { if (opts.calls) { opts.calls.n++; } return text; },
    async getFimPrefix() { return opts.fimPrefix ?? null; },
  };
}
function capturingClient(
  text: string,
  sink: { prompt?: string; stop?: string[] },
  fimPrefix: string | null = null,
): CompletionClient {
  return {
    async complete(prompt: string, stop: string[]) { sink.prompt = prompt; sink.stop = stop; return text; },
    async getFimPrefix() { return fimPrefix; },
  };
}
function engineWith(client: CompletionClient): CompletionEngine {
  const e = new CompletionEngine(new FimTemplates(), new CompletionCache(10));
  e.setClient(client);
  return e;
}
function req(over: Partial<CompletionRequest> = {}): CompletionRequest {
  return { repoName: "workspace", prefix: "", suffix: "", files: [], ...over };
}
const sig = () => new AbortController().signal;

suite("CompletionEngine", () => {
  test("returns the client's generated text", async () => {
    const e = engineWith(fakeClient("a, b) { return a + b; }"));
    const { text } = await e.complete(req({ prefix: "function add(" }), sig());
    assert.strictEqual(text, "a, b) { return a + b; }");
  });

  test("returns null when no client is set", async () => {
    const e = new CompletionEngine(new FimTemplates(), new CompletionCache(10));
    const { text } = await e.complete(req({ prefix: "x" }), sig());
    assert.strictEqual(text, null);
  });

  test("uses the qwen repo template when the client reports the fim_prefix marker", async () => {
    const sink: { prompt?: string; stop?: string[] } = {};
    const e = engineWith(capturingClient("1;", sink, "<|fim_prefix|>"));
    await e.complete(req({ prefix: "const x = ", filePath: "src/foo.ts", repoName: "myrepo" }), sig());
    assert.strictEqual(
      sink.prompt,
      "<|repo_name|>myrepo\n<|file_sep|>src/foo.ts\n<|fim_prefix|>const x = <|fim_suffix|><|fim_middle|>",
    );
    assert.ok(sink.stop!.includes("<|endoftext|>"));
  });

  test("falls back to the cursor template when the client reports no fim marker", async () => {
    const sink: { prompt?: string; stop?: string[] } = {};
    const e = engineWith(capturingClient("1;", sink, null));
    await e.complete(req({ prefix: "const x = ", suffix: ";" }), sig());
    assert.strictEqual(sink.prompt, "const x = <|cursor|>;");
    assert.deepStrictEqual(sink.stop, []);
  });

  test("passes the raw prefix/suffix parts to the client alongside the rendered prompt", async () => {
    const sink: { parts?: { prefix: string; suffix: string } } = {};
    const client: CompletionClient = {
      async complete(_prompt: string, _stop: string[], _signal: AbortSignal, parts?: { prefix: string; suffix: string }) {
        sink.parts = parts;
        return "x";
      },
      async getFimPrefix() { return null; },
    };
    const e = engineWith(client);
    await e.complete(req({ prefix: "const x = ", suffix: ";" }), sig());
    assert.deepStrictEqual(sink.parts, { prefix: "const x = ", suffix: ";" });
  });

  test("calls the client once per request and returns its text", async () => {
    const calls = { n: 0 };
    const e = engineWith(fakeClient("42;", { calls }));
    const a = await e.complete(req({ prefix: "const x = " }), sig());
    assert.strictEqual(a.text, "42;");
    assert.strictEqual(calls.n, 1);
  });

  test("reports cacheHit false (caching is not wired in the current engine)", async () => {
    const e = engineWith(fakeClient("7;"));
    assert.strictEqual((await e.complete(req(), sig())).cacheHit, false);
    assert.strictEqual((await e.complete(req(), sig())).cacheHit, false);
  });

  test("returns null when the client call throws", async () => {
    const client: CompletionClient = {
      async complete() { throw new Error("boom"); },
      async getFimPrefix() { return null; },
    };
    const e = engineWith(client);
    const { text } = await e.complete(req({ prefix: "function add(" }), sig());
    assert.strictEqual(text, null);
  });

  test("prewarm delegates to the client", () => {
    let warmed = 0;
    const client: CompletionClient = {
      async complete() { return ""; },
      async getFimPrefix() { return null; },
      prewarm() { warmed++; },
    };
    const e = engineWith(client);
    e.prewarm();
    assert.strictEqual(warmed, 1);
  });

  test("prewarm no-ops when no client is set", () => {
    const e = new CompletionEngine(new FimTemplates(), new CompletionCache(10));
    assert.doesNotThrow(() => e.prewarm());
  });

  test("prewarm no-ops when the client has no prewarm", () => {
    const e = engineWith(fakeClient("x")); // fakeClient defines only complete()/getFimPrefix()
    assert.doesNotThrow(() => e.prewarm());
  });
});
