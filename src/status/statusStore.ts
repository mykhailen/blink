export type DisplayState = "disabled" | "setup" | "error" | "working" | "idle";

export interface StatusInputs {
  enabled: boolean;
  configured: boolean;
  hasModels: boolean;  // models registry non-empty (false -> first-run setup needed)
  backend: string;  // active model's backend ("" when none)
  model: string;    // active model name (the selector)
  target: string;   // gguf basename / api host / ollama url / "—"
}

export interface ActiveFileStatus {
  filePattern: string | null;    // toggle target for the active file ("*.ts"); null = no file editor
  matchedPattern: string | null; // blacklist entry blocking it, or null
}

/** Newest release's notes for the tooltip + unread-badge flag. */
export interface WhatsNew {
  version: string;
  bullets: string[];
  unseen: boolean;
}

export interface StatusDisplay {
  state: DisplayState;
  icon: string;
  label: string;
  detail: string;
  backend: string;
  model: string;
  target: string;
  enabled: boolean;
  filePattern: string | null;
  matchedPattern: string | null;
  whatsNew: WhatsNew | null;
}

/**
 * Single source of truth for blink's runtime status. Pure (no vscode), so the
 * state -> display mapping is unit-testable. Views subscribe() and re-render.
 */
export class StatusStore {
  private enabled = false;
  private configured = false;
  private hasModels = false;
  private backend = "";
  private model = "";
  private target = "";
  private working = false;
  private error: string | null = null;
  private filePattern: string | null = null;
  private matchedPattern: string | null = null;
  private whatsNew: WhatsNew | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const l of this.listeners) { l(); }
  }

  /** Apply config-derived inputs; clears any prior error (e.g. user fixed settings). */
  setConfig(inputs: StatusInputs): void {
    const changed =
      this.enabled !== inputs.enabled ||
      this.configured !== inputs.configured ||
      this.hasModels !== inputs.hasModels ||
      this.backend !== inputs.backend ||
      this.model !== inputs.model ||
      this.target !== inputs.target ||
      this.error !== null;
    if (!changed) { return; }
    this.enabled = inputs.enabled;
    this.configured = inputs.configured;
    this.hasModels = inputs.hasModels;
    this.backend = inputs.backend;
    this.model = inputs.model;
    this.target = inputs.target;
    this.error = null;
    this.notify();
  }

  setWorking(working: boolean): void {
    if (this.working === working) { return; }
    this.working = working;
    this.notify();
  }

  setError(message: string): void {
    if (this.error === message) { return; }
    this.error = message;
    this.notify();
  }

  /** Track the active editor's blacklist status (fed by ActiveFileMonitor). */
  setActiveFile(file: ActiveFileStatus): void {
    if (this.filePattern === file.filePattern && this.matchedPattern === file.matchedPattern) { return; }
    this.filePattern = file.filePattern;
    this.matchedPattern = file.matchedPattern;
    this.notify();
  }

  /** Publish (or clear) the newest release's notes for tooltip + badge. */
  setWhatsNew(notes: WhatsNew | null): void {
    if (JSON.stringify(this.whatsNew) === JSON.stringify(notes)) { return; }
    this.whatsNew = notes;
    this.notify();
  }

  /** Clear the unread badge (tooltip section keeps rendering). */
  markNotesSeen(): void {
    if (!this.whatsNew?.unseen) { return; }
    this.whatsNew = { ...this.whatsNew, unseen: false };
    this.notify();
  }

  getDisplay(): StatusDisplay {
    const base = {
      label: "",
      backend: this.backend,
      model: this.model,
      target: this.target,
      enabled: this.enabled,
      filePattern: this.filePattern,
      matchedPattern: this.matchedPattern,
      whatsNew: this.whatsNew,
    };
    if (!this.enabled) {
      return { ...base, state: "disabled", icon: "$(blink-disabled)", detail: "Disabled" };
    }
    if (!this.hasModels) {
      return {
        ...base,
        state: "setup",
        icon: "$(blink-issue)",
        detail: "No model set up — pick one to get started",
      };
    }
    if (!this.configured) {
      return { ...base, state: "setup", icon: "$(blink-issue)", detail: "Model not configured — check its settings" };
    }
    if (this.error) {
      return { ...base, state: "error", icon: "$(blink-issue)", detail: `Error: ${this.error}` };
    }
    if (this.matchedPattern) {
      return { ...base, state: "disabled", icon: "$(blink-disabled)", detail: `Disabled for ${this.matchedPattern}` };
    }
    if (this.working) {
      return { ...base, state: "working", icon: "$(loading~spin)", detail: "Working…" };
    }
    const idleIcon = this.whatsNew?.unseen ? "$(blink-update)" : "$(blink-logo)";
    return { ...base, state: "idle", icon: idleIcon, detail: "Ready" };
  }
}
