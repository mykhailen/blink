import * as assert from "assert";
import { StatusStore, type StatusInputs, type WhatsNew } from "../status/statusStore.js";

function inputs(over: Partial<StatusInputs> = {}): StatusInputs {
  return {
    enabled: true,
    configured: true,
    hasModels: true,
    backend: "llamacpp",
    model: "local-qwen",
    target: "qwen2.5-coder-3b-base-q6_k.gguf",
    ...over,
  };
}

suite("StatusStore", () => {
  test("idle when enabled, configured, not working, no error", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    const d = s.getDisplay();
    assert.strictEqual(d.state, "idle");
    assert.strictEqual(d.icon, "$(blink-logo)");
    assert.strictEqual(d.detail, "Ready");
    assert.strictEqual(d.label, "");
  });

  test("disabled when not enabled", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ enabled: false }));
    assert.strictEqual(s.getDisplay().state, "disabled");
    assert.strictEqual(s.getDisplay().icon, "$(blink-disabled)");
  });

  test("setup state when no models are configured", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ hasModels: false, configured: false, backend: "", model: "", target: "—" }));
    const d = s.getDisplay();
    assert.strictEqual(d.state, "setup");
    assert.strictEqual(d.icon, "$(blink-issue)");
    assert.strictEqual(d.label, ""); // glyph-only status bar: the icon carries the state
    assert.strictEqual(d.detail, "No model set up — pick one to get started");
  });

  test("disabled takes precedence over setup", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ enabled: false, hasModels: false }));
    assert.strictEqual(s.getDisplay().state, "disabled");
  });

  test("setup takes precedence over error", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ hasModels: false, configured: false }));
    s.setError("boom");
    assert.strictEqual(s.getDisplay().state, "setup");
  });

  test("setup state when the active model is not configured", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ configured: false }));
    const d = s.getDisplay();
    assert.strictEqual(d.state, "setup");
    assert.strictEqual(d.icon, "$(blink-issue)");
    assert.strictEqual(d.detail, "Model not configured — check its settings");
  });

  test("working maps to spinner", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setWorking(true);
    const d = s.getDisplay();
    assert.strictEqual(d.state, "working");
    assert.strictEqual(d.icon, "$(loading~spin)");
    assert.strictEqual(d.detail, "Working…");
  });

  test("error takes precedence over working", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setWorking(true);
    s.setError("model load failed");
    const d = s.getDisplay();
    assert.strictEqual(d.state, "error");
    assert.strictEqual(d.icon, "$(blink-issue)");
    assert.strictEqual(d.detail, "Error: model load failed");
  });

  test("disabled takes precedence over error", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ enabled: false }));
    s.setError("boom");
    assert.strictEqual(s.getDisplay().state, "disabled");
  });

  test("display.enabled reflects the configured enabled flag", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ enabled: true }));
    assert.strictEqual(s.getDisplay().enabled, true);
    s.setConfig(inputs({ enabled: false }));
    assert.strictEqual(s.getDisplay().enabled, false);
  });

  test("exposes backend, model, and target from setConfig", () => {
    const s = new StatusStore();
    s.setConfig(inputs({ backend: "llamacpp", model: "local-qwen", target: "qwen.gguf" }));
    const d = s.getDisplay();
    assert.strictEqual(d.backend, "llamacpp");
    assert.strictEqual(d.model, "local-qwen");
    assert.strictEqual(d.target, "qwen.gguf");
  });

  test("setConfig clears a previously-set error", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setError("boom");
    assert.strictEqual(s.getDisplay().state, "error");
    s.setConfig(inputs());
    assert.strictEqual(s.getDisplay().state, "idle");
  });

  test("subscribers are notified on change and stop after unsubscribe", () => {
    const s = new StatusStore();
    let n = 0;
    const unsub = s.subscribe(() => { n++; });
    s.setWorking(true);
    assert.strictEqual(n, 1);
    unsub();
    s.setWorking(false);
    assert.strictEqual(n, 1);
  });

  test("setting an identical value does not notify", () => {
    const s = new StatusStore();
    s.setWorking(true);
    let n = 0;
    s.subscribe(() => { n++; });
    s.setWorking(true);
    assert.strictEqual(n, 0);
  });

  test("active-file match shows 'Disabled for <pattern>' with the disabled glyph", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setActiveFile({ filePattern: "*.md", matchedPattern: "*.md" });
    const d = s.getDisplay();
    assert.strictEqual(d.state, "disabled");
    assert.strictEqual(d.icon, "$(blink-disabled)");
    assert.strictEqual(d.detail, "Disabled for *.md");
  });

  test("error takes precedence over a blacklisted active file", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setActiveFile({ filePattern: "*.md", matchedPattern: "*.md" });
    s.setError("boom");
    assert.strictEqual(s.getDisplay().state, "error");
  });

  test("a blacklisted active file takes precedence over working", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setWorking(true);
    s.setActiveFile({ filePattern: "*.md", matchedPattern: "*.md" });
    assert.strictEqual(s.getDisplay().state, "disabled");
  });

  test("display exposes filePattern and matchedPattern for the tooltip", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    s.setActiveFile({ filePattern: "*.ts", matchedPattern: null });
    const d = s.getDisplay();
    assert.strictEqual(d.filePattern, "*.ts");
    assert.strictEqual(d.matchedPattern, null);
    assert.strictEqual(d.state, "idle");
  });

  test("filePattern defaults to null (no active file editor)", () => {
    const s = new StatusStore();
    s.setConfig(inputs());
    assert.strictEqual(s.getDisplay().filePattern, null);
    assert.strictEqual(s.getDisplay().matchedPattern, null);
  });

  test("setActiveFile with identical values does not notify", () => {
    const s = new StatusStore();
    s.setActiveFile({ filePattern: "*.ts", matchedPattern: null });
    let n = 0;
    s.subscribe(() => { n++; });
    s.setActiveFile({ filePattern: "*.ts", matchedPattern: null });
    assert.strictEqual(n, 0);
    s.setActiveFile({ filePattern: "*.md", matchedPattern: "*.md" });
    assert.strictEqual(n, 1);
  });
});

suite("StatusStore what's new", () => {
  const notes: WhatsNew = { version: "0.1.5", bullets: ["a"], unseen: true };

  function readyStore(): StatusStore {
    const store = new StatusStore();
    store.setConfig(inputs());
    return store;
  }

  test("display carries whatsNew (null by default)", () => {
    assert.strictEqual(readyStore().getDisplay().whatsNew, null);
    const store = readyStore();
    store.setWhatsNew(notes);
    assert.deepStrictEqual(store.getDisplay().whatsNew, notes);
  });

  test("idle icon shows the update badge while unseen", () => {
    const store = readyStore();
    store.setWhatsNew(notes);
    assert.strictEqual(store.getDisplay().icon, "$(blink-update)");
  });

  test("idle icon is the plain logo when notes are seen", () => {
    const store = readyStore();
    store.setWhatsNew({ ...notes, unseen: false });
    assert.strictEqual(store.getDisplay().icon, "$(blink-logo)");
  });

  test("state icons keep precedence over the badge", () => {
    const store = readyStore();
    store.setWhatsNew(notes);
    store.setError("boom");
    assert.strictEqual(store.getDisplay().icon, "$(blink-issue)");
    // whatsNew still rides along for the tooltip
    assert.deepStrictEqual(store.getDisplay().whatsNew, notes);
  });

  test("markNotesSeen clears the badge and notifies once", () => {
    const store = readyStore();
    store.setWhatsNew(notes);
    let notified = 0;
    store.subscribe(() => { notified++; });
    store.markNotesSeen();
    assert.strictEqual(store.getDisplay().whatsNew?.unseen, false);
    assert.strictEqual(store.getDisplay().icon, "$(blink-logo)");
    assert.strictEqual(notified, 1);
    store.markNotesSeen(); // idempotent — no second notify
    assert.strictEqual(notified, 1);
  });

  test("setWhatsNew with an identical value does not notify", () => {
    const store = readyStore();
    store.setWhatsNew(notes);
    let notified = 0;
    store.subscribe(() => { notified++; });
    store.setWhatsNew({ ...notes });
    assert.strictEqual(notified, 0);
  });
});
