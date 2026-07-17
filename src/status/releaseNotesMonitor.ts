import * as vscode from "vscode";
import { StatusStore } from "./statusStore.js";
import {
  computeNotesFreshness,
  parseLatestReleaseNotes,
  type NotesFirstShown,
} from "./releaseNotes.js";
import { token, Inject } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

export interface IReleaseNotesMonitor {
  register(): void;
  markSeen(): void;
  openChangelog(): Thenable<unknown>;
}

// Merges with the interface above: one name serves as both type and token.
export const IReleaseNotesMonitor = token<IReleaseNotesMonitor>("releaseNotesMonitor");

const SEEN_KEY = "blink.notesSeenVersion";
const FIRST_SHOWN_KEY = "blink.notesFirstShown";

/**
 * Thin vscode adapter: reads the bundled CHANGELOG.md + globalState once at
 * startup and feeds StatusStore.whatsNew (badge + tooltip section). Parsing
 * and freshness decisions live in releaseNotes.ts (pure, tested); this class
 * is F5-verified (no unit test), like ActiveFileMonitor.
 */
export class ReleaseNotesMonitor implements IReleaseNotesMonitor {
  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @Inject(StatusStore) private readonly status: StatusStore,
  ) { }

  register(): void {
    void this.load();
  }

  markSeen(): void {
    void this.context.globalState.update(SEEN_KEY, this.currentVersion());
    this.status.markNotesSeen();
  }

  openChangelog(): Thenable<unknown> {
    return vscode.commands.executeCommand("markdown.showPreview", this.changelogUri());
  }

  private changelogUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.extensionUri, "CHANGELOG.md");
  }

  private currentVersion(): string {
    return String(this.context.extension.packageJSON.version ?? "");
  }

  private async load(): Promise<void> {
    let markdown: string;
    try {
      markdown = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.changelogUri()));
    } catch {
      return; // no changelog bundled -> feature silently absent
    }
    const notes = parseLatestReleaseNotes(markdown);
    if (!notes) { return; }

    const version = this.currentVersion();
    const seen = this.context.globalState.get<string>(SEEN_KEY);
    const firstShown = this.context.globalState.get<NotesFirstShown>(FIRST_SHOWN_KEY);
    const { unseen, firstShownAt } = computeNotesFreshness(seen, firstShown, version, Date.now());

    if (seen === undefined || (seen !== version && !unseen)) {
      // Fresh install, or the 24 h badge window expired: record as seen so
      // later activations don't recompute against a stale stamp.
      await this.context.globalState.update(SEEN_KEY, version);
    } else if (seen !== version) {
      const stamp: NotesFirstShown = { version, at: firstShownAt };
      await this.context.globalState.update(FIRST_SHOWN_KEY, stamp);
    }
    this.status.setWhatsNew({ ...notes, unseen });
  }
}
