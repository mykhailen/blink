/**
 * Release-notes logic for the status bar "What's New" surface. Pure (no
 * vscode): CHANGELOG.md parsing + badge freshness decisions, unit-tested;
 * ReleaseNotesMonitor owns the file/globalState IO.
 */

export interface ReleaseNotes {
  version: string;
  bullets: string[];
}

/** globalState payload: when the badge first appeared for a version. */
export interface NotesFirstShown {
  version: string;
  at: number;
}

export interface NotesFreshness {
  unseen: boolean;
  firstShownAt: number;
}

export const NOTES_MAX_BULLETS = 4;
export const NOTES_MAX_BULLET_CHARS = 80;
export const NOTES_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Extract the newest version section from CHANGELOG.md: the first `## `
 * heading carrying a digits-and-dots token (an unversioned `[Unreleased]`
 * section is skipped), top-level `- ` bullets with their wrapped
 * continuation lines merged, capped and ellipsized for tooltip width.
 * Malformed/missing input -> null (the feature is silently absent, never an
 * error state).
 */
export function parseLatestReleaseNotes(markdown: string): ReleaseNotes | null {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let version: string | undefined;
  for (let i = 0; i < lines.length && start === -1; i++) {
    if (!lines[i].startsWith("## ")) { continue; }
    version = /\d+(?:\.\d+)*/.exec(lines[i])?.[0];
    if (version) { start = i; }
  }
  if (start === -1 || !version) { return null; }
  const bullets: string[] = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) {
    if (!lines[i].startsWith("- ")) { continue; }
    if (bullets.length === NOTES_MAX_BULLETS) { break; }
    let text = lines[i].slice(2).trim();
    // A wrapped bullet continues on indented lines (but a nested bullet doesn't).
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s*-\s/.test(lines[i + 1])) {
      text += " " + lines[++i].trim();
    }
    bullets.push(
      text.length > NOTES_MAX_BULLET_CHARS
        ? text.slice(0, NOTES_MAX_BULLET_CHARS - 1) + "…"
        : text,
    );
  }
  return bullets.length > 0 ? { version, bullets } : null;
}

/**
 * Decide whether the badge shows. Fresh installs (no seen version) and the
 * already-seen version are never unseen; a changed version is unseen until
 * marked read or until more than 24 h pass after its first sighting.
 * firstShownAt echoes the stamp the caller should persist.
 */
export function computeNotesFreshness(
  seenVersion: string | undefined,
  firstShown: NotesFirstShown | undefined,
  currentVersion: string,
  now: number,
): NotesFreshness {
  const firstShownAt = firstShown?.version === currentVersion ? firstShown.at : now;
  if (seenVersion === undefined || seenVersion === currentVersion) {
    return { unseen: false, firstShownAt };
  }
  return { unseen: now - firstShownAt <= NOTES_BADGE_TTL_MS, firstShownAt };
}
