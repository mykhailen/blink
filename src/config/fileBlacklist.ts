/**
 * Filename-glob matching for blink.disabledFiles. Pure (no vscode): patterns
 * like "*.md" are matched against a document's basename, case-insensitively.
 * Only `*` (any run) and `?` (one char) are glob characters; everything else
 * is literal. Bad patterns never throw — they simply don't match.
 */

function globToRegExp(pattern: string): RegExp | undefined {
  const trimmed = pattern.trim();
  if (!trimmed) { return undefined; }
  const source = trimmed
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${source}$`, "i");
  } catch {
    return undefined;
  }
}

/** First pattern matching `basename`, or undefined — so the UI can show which entry blocks a file. */
export function matchDisabledFile(
  basename: string,
  patterns: readonly string[],
): string | undefined {
  for (const pattern of patterns) {
    if (globToRegExp(pattern)?.test(basename)) { return pattern; }
  }
  return undefined;
}

/**
 * The blacklist pattern the tooltip toggle targets for this file: "*.<ext>"
 * when the basename has an extension, the exact basename otherwise (dotfiles
 * like ".gitignore" and trailing-dot names count as extensionless).
 */
export function patternForFile(basename: string): string {
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) { return basename; }
  return `*${basename.slice(dot)}`;
}

/**
 * URI schemes of chat prompt inputs (Copilot Chat view, quick chat, editor and
 * terminal inline chat, the sessions view). Real text documents, so the
 * catch-all provider selector would otherwise fire FIM requests for every
 * keystroke of a prompt. Re-enabled by blink.enableInChat.
 */
const CHAT_INPUT_SCHEMES: readonly string[] = ["chatSessionInput", "sessions-chat"];

/** URI scheme of the source control commit message box. Re-enabled by blink.enableInCommitMessage. */
const COMMIT_INPUT_SCHEME = "vscode-scm";

export interface SchemeGateConfig {
  enableInChat: boolean;
  enableInCommitMessage: boolean;
  /** User-supplied extra schemes; always disabled, even when a checkbox re-enables a built-in. */
  disabledSchemes: readonly string[];
}

/**
 * Whether blink should stay quiet in a document with this URI scheme. The two
 * checkboxes only remove their built-in defaults; blink.disabledSchemes is a
 * plain blacklist and wins. Entries are trimmed and matched case-insensitively.
 */
export function isDisabledScheme(scheme: string, config: SchemeGateConfig): boolean {
  const s = scheme.toLowerCase();
  if (s && config.disabledSchemes.some((entry) => entry.trim().toLowerCase() === s)) {
    return true;
  }
  if (!config.enableInChat && CHAT_INPUT_SCHEMES.some((c) => c.toLowerCase() === s)) {
    return true;
  }
  return !config.enableInCommitMessage && s === COMMIT_INPUT_SCHEME;
}
