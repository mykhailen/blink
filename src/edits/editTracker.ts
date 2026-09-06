import * as vscode from "vscode";
import { ILogger } from "../common/logging.js";
import { IConfigProvider } from "../config/config.js";
import { token } from "../di/container.js";
import { ExtensionContext } from "../di/vscodeTokens.js";

export interface ContextFile {
  path: string;
  content: string;
}

export interface EditRegion {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  seq: number;
}

const MAX_REGIONS = 20;

/**
 * Expand an edited line span by `pad` lines, clamped to `[0, lineCount-1]` and
 * kept in order (start <= end) even if the original span is past a now-shorter
 * document. Pure — no vscode types.
 */
export function expandRange(
  startLine: number,
  endLine: number,
  lineCount: number,
  pad: number,
): { startLine: number; endLine: number } {
  const max = Math.max(0, lineCount - 1);
  const s = Math.min(max, Math.max(0, startLine - pad));
  const e = Math.min(max, Math.max(s, endLine + pad));
  return { startLine: s, endLine: e };
}

export interface IEditTracker {
  register(): void;
  record(region: EditRegion): void;
  select(excludePath: string | undefined, maxSnippets: number, maxChars: number): ContextFile[];
}

// Merges with the interface above: one name serves as both type and token.
export const IEditTracker = token<IEditTracker>("editTracker");

/**
 * Bounded recency list of edited regions across files. Pure (no vscode) so it
 * unit-tests without an editor. `seq` is a caller-supplied monotonic recency
 * stamp, keeping the tracker free of clocks.
 */
export class EditTracker implements IEditTracker {
  private regions: EditRegion[] = [];
  constructor(
    @ExtensionContext private readonly context: vscode.ExtensionContext,
    @IConfigProvider private readonly config: IConfigProvider,
    @ILogger private readonly log: ILogger,
  ) {
    this.log = log;
    this.config = config;
  }

  register() {
    let editSeq = 0;
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        try {
          if (
            e.document.uri.scheme !== "file" ||
            e.document.isUntitled ||
            e.contentChanges.length === 0
          ) {
            return;
          }
          let startLine = Number.MAX_SAFE_INTEGER;
          let endLine = 0;
          for (const c of e.contentChanges) {
            startLine = Math.min(startLine, c.range.start.line);
            endLine = Math.max(endLine, c.range.end.line);
          }
          const span = expandRange(startLine, endLine, e.document.lineCount, 2);
          const range = new vscode.Range(
            span.startLine,
            0,
            span.endLine,
            e.document.lineAt(span.endLine).text.length,
          );
          this.record({
            path: vscode.workspace.asRelativePath(e.document.uri),
            startLine: span.startLine,
            endLine: span.endLine,
            text: e.document.getText(range),
            seq: ++editSeq,
          });
        } catch (err) {
          this.log.info(`edit tracker error: ${String(err)}`);
        }
      })
    );
  }

  record(region: EditRegion): void {
    // Coalesce: an overlapping or directly-adjacent same-file region replaces
    // the existing one (refreshed text + recency) instead of duplicating.
    const idx = this.regions.findIndex(
      (r) =>
        r.path === region.path &&
        region.startLine <= r.endLine + 1 &&
        r.startLine <= region.endLine + 1,
    );
    if (idx !== -1) {
      this.regions.splice(idx, 1);
    }
    this.regions.push(region);
    if (this.regions.length > MAX_REGIONS) {
      this.regions.sort((a, b) => a.seq - b.seq);
      this.regions = this.regions.slice(this.regions.length - MAX_REGIONS);
    }
  }

  select(excludePath: string | undefined, maxSnippets: number, maxChars: number): ContextFile[] {
    const ranked = this.regions
      .filter((r) => r.path !== excludePath)
      .sort((a, b) => b.seq - a.seq); // most recent first
    const chosen: EditRegion[] = [];
    let chars = 0;
    for (const r of ranked) {
      if (chosen.length >= maxSnippets) {
        break;
      }
      if (chars + r.text.length > maxChars) {
        continue; // skip-if-over; don't truncate mid-snippet
      }
      chosen.push(r);
      chars += r.text.length;
    }
    // Oldest-first so the renderer (which appends top-down before the current
    // file) puts the newest edit nearest the FIM section.
    return chosen
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ path: r.path, content: r.text }));
  }
}
