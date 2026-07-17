import * as assert from "assert";
import { OpenAICompletionClient } from "../clients/openai/openAiClient.js";
import { openAiModel } from "./fixtures.js";

function fakeFetch(captured: { url?: string; body?: any; headers?: any }) {
  return async (url: any, init: any): Promise<Response> => {
    captured.url = String(url);
    captured.headers = init.headers;
    captured.body = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ text: "  completed()" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

suite("OpenAICompletionClient", () => {
  test("POSTs to /v1/completions with prompt, model, stop and bearer key", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({
      apiBaseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      modelId: "qwen2.5-coder",
      maxTokens: 256,
      requestTimeoutMs: 3000,
    }));

    const text = await client.complete("PROMPT", ["<|endoftext|>"], new AbortController().signal);

    assert.strictEqual(text, "  completed()");
    assert.strictEqual(captured.url, "https://api.example.com/v1/completions");
    assert.strictEqual(captured.body.model, "qwen2.5-coder");
    assert.strictEqual(captured.body.prompt, "PROMPT");
    assert.strictEqual(captured.body.max_tokens, 256);
    assert.strictEqual(captured.body.temperature, 0);
    assert.deepStrictEqual(captured.body.stop, ["<|endoftext|>"]);
    assert.strictEqual(captured.headers.Authorization, "Bearer sk-test");
  });

  test("returns '' when complete is called before setConfig", async () => {
    const client = new OpenAICompletionClient((async () => new Response("{}")) as any);
    const text = await client.complete("p", [], new AbortController().signal);
    assert.strictEqual(text, "");
  });

  test("returns empty string on a non-200 response", async () => {
    const errFetch = async (): Promise<Response> =>
      new Response("rate limited", { status: 429 });
    const client = new OpenAICompletionClient(errFetch as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    const text = await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(text, "");
  });

  test("normalizes a baseUrl that already ends with a slash", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://api.example.com/v1/", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(captured.url, "https://api.example.com/v1/completions");
  });

  test("uses an apiBaseUrl that already ends with /completions as-is (Mistral-style full URL)", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://api.mistral.ai/v1/fim/completions", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(captured.url, "https://api.mistral.ai/v1/fim/completions");
  });

  test("prefix-suffix style sends the raw prefix as prompt and the suffix separately", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ promptStyle: "prefix-suffix", apiBaseUrl: "https://api.mistral.ai/v1/fim", apiKey: "k", modelId: "codestral-2508", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("RENDERED", ["</s>"], new AbortController().signal, { prefix: "const x = ", suffix: ";" });
    assert.strictEqual(captured.body.prompt, "const x = ");
    assert.strictEqual(captured.body.suffix, ";");
    assert.deepStrictEqual(captured.body.stop, ["</s>"]);
  });

  test("raw style (default) sends the rendered prompt and no suffix field even when parts are given", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("RENDERED", [], new AbortController().signal, { prefix: "PRE", suffix: "SUF" });
    assert.strictEqual(captured.body.prompt, "RENDERED");
    assert.strictEqual("suffix" in captured.body, false);
  });

  test("prefix-suffix style falls back to the rendered prompt when no parts are given", async () => {
    const captured: any = {};
    const client = new OpenAICompletionClient(fakeFetch(captured) as any);
    client.setConfig(openAiModel({ promptStyle: "prefix-suffix", apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    await client.complete("RENDERED", [], new AbortController().signal);
    assert.strictEqual(captured.body.prompt, "RENDERED");
    assert.strictEqual("suffix" in captured.body, false);
  });

  test("parses a chat-shaped response (choices[].message.content) like Mistral's FIM endpoint returns", async () => {
    const chatFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          object: "chat.completion",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "DONE" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = new OpenAICompletionClient(chatFetch as any);
    client.setConfig(openAiModel({ promptStyle: "prefix-suffix", apiBaseUrl: "https://api.mistral.ai/v1/fim", apiKey: "k", modelId: "codestral-2508", maxTokens: 10, requestTimeoutMs: 1000 }));
    const text = await client.complete("P", [], new AbortController().signal, { prefix: "p", suffix: "s" });
    assert.strictEqual(text, "DONE");
  });

  test("logs the status and a body snippet on a non-OK response", async () => {
    const messages: string[] = [];
    const errFetch = async (): Promise<Response> =>
      new Response("Unauthorized: invalid api key", { status: 401 });
    const client = new OpenAICompletionClient(errFetch as any, {
      info: (m: string) => messages.push(m),
      error: (m: string) => messages.push(m),
    });
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 1000 }));
    const text = await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(text, "");
    assert.ok(
      messages.some((m) => m.includes("401") && m.includes("Unauthorized")),
      `expected a log line with status and body, got: ${JSON.stringify(messages)}`,
    );
  });

  test("does not abort a slow response when the model entry omits requestTimeoutMs (backend default applies)", async () => {
    const slowFetch = (_url: any, init: any): Promise<Response> =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => resolve(new Response(
          JSON.stringify({ choices: [{ text: "SLOW-OK" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        )), 30);
      });
    const client = new OpenAICompletionClient(slowFetch as any);
    client.setConfig(openAiModel({
      apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10,
      requestTimeoutMs: undefined as unknown as number,
    }));
    const text = await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(text, "SLOW-OK");
  });

  test("aborts when the configured requestTimeoutMs elapses", async () => {
    const slowFetch = (_url: any, init: any): Promise<Response> =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => resolve(new Response("{}", { status: 200 })), 300);
      });
    const client = new OpenAICompletionClient(slowFetch as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 20 }));
    const text = await client.complete("P", [], new AbortController().signal);
    assert.strictEqual(text, "");
  });

  test("returns empty string when the caller signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let fetchCalled = false;
    const hangFetch = (() => {
      fetchCalled = true;
      return new Promise<Response>(() => {}); // never resolves
    });
    const client = new OpenAICompletionClient(hangFetch as any);
    client.setConfig(openAiModel({ apiBaseUrl: "https://x/v1", apiKey: "k", modelId: "m", maxTokens: 10, requestTimeoutMs: 60000 }));
    const text = await client.complete("P", [], ctrl.signal);
    assert.strictEqual(text, "");
    void fetchCalled;
  });
});
