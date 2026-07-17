import * as assert from "assert";
import {
  parseLatestReleaseNotes,
  computeNotesFreshness,
  NOTES_BADGE_TTL_MS,
} from "../status/releaseNotes.js";

const CHANGELOG = [
  "# Changelog",
  "",
  "## 0.1.5 — 2026-07-17",
  "",
  "- Double-press Escape to toggle completions",
  "- What's New in the status bar tooltip",
  "",
  "## 0.1.4 — earlier",
  "",
  "- Old entry",
].join("\n");

suite("parseLatestReleaseNotes", () => {
  test("returns the first section's version and bullets only", () => {
    const notes = parseLatestReleaseNotes(CHANGELOG);
    assert.deepStrictEqual(notes, {
      version: "0.1.5",
      bullets: ["Double-press Escape to toggle completions", "What's New in the status bar tooltip"],
    });
  });

  test("accepts Keep-a-Changelog bracketed headings", () => {
    const notes = parseLatestReleaseNotes("## [1.2.0] - 2026-01-01\n- One thing");
    assert.strictEqual(notes?.version, "1.2.0");
  });

  test("caps bullets at 4", () => {
    const md = "## 2.0\n- a\n- b\n- c\n- d\n- e\n- f";
    assert.strictEqual(parseLatestReleaseNotes(md)?.bullets.length, 4);
  });

  test("ellipsizes bullets longer than 80 chars", () => {
    const long = "x".repeat(100);
    const bullet = parseLatestReleaseNotes(`## 2.0\n- ${long}`)?.bullets[0];
    assert.strictEqual(bullet?.length, 80);
    assert.ok(bullet.endsWith("…"));
  });

  test("ignores indented (nested) bullets and non-bullet lines", () => {
    const md = "## 2.0\nprose line\n- top\n  - nested\n- also top";
    assert.deepStrictEqual(parseLatestReleaseNotes(md)?.bullets, ["top", "also top"]);
  });

  test("returns null when there is no ## section", () => {
    assert.strictEqual(parseLatestReleaseNotes("# Changelog\njust prose"), null);
  });

  test("returns null when the heading has no version token", () => {
    assert.strictEqual(parseLatestReleaseNotes("## Unreleased\n- thing"), null);
  });

  test("returns null when the section has no bullets", () => {
    assert.strictEqual(parseLatestReleaseNotes("## 0.1.5\nprose only"), null);
  });

  test("returns null for empty input", () => {
    assert.strictEqual(parseLatestReleaseNotes(""), null);
  });

  test("handles CRLF line endings", () => {
    const notes = parseLatestReleaseNotes("## 0.2.0\r\n- windows line\r\n");
    assert.deepStrictEqual(notes?.bullets, ["windows line"]);
  });

  test("skips a leading [Unreleased] section and parses the first versioned one", () => {
    const md = "# Change Log\n\n## [Unreleased]\n\n- not yet shipped\n\n## [0.1.5] — 2026-07-17\n\n- shipped thing";
    const notes = parseLatestReleaseNotes(md);
    assert.deepStrictEqual(notes, { version: "0.1.5", bullets: ["shipped thing"] });
  });

  test("merges wrapped continuation lines into one bullet before ellipsizing", () => {
    const md = "## 0.1.4\n\n- Double-press Escape to toggle\n  completions on and off.\n- Next bullet";
    assert.deepStrictEqual(parseLatestReleaseNotes(md)?.bullets, [
      "Double-press Escape to toggle completions on and off.",
      "Next bullet",
    ]);
  });
});

suite("computeNotesFreshness", () => {
  const NOW = 1_000_000_000;

  test("fresh install (no seen version) is not unseen", () => {
    const r = computeNotesFreshness(undefined, undefined, "0.1.5", NOW);
    assert.deepStrictEqual(r, { unseen: false, firstShownAt: NOW });
  });

  test("same version already seen is not unseen", () => {
    const r = computeNotesFreshness("0.1.5", undefined, "0.1.5", NOW);
    assert.strictEqual(r.unseen, false);
  });

  test("new version is unseen, first sighting stamps now", () => {
    const r = computeNotesFreshness("0.1.4", undefined, "0.1.5", NOW);
    assert.deepStrictEqual(r, { unseen: true, firstShownAt: NOW });
  });

  test("new version within 24h of first sighting stays unseen, keeps the stamp", () => {
    const at = NOW - NOTES_BADGE_TTL_MS; // exactly 24h -> still unseen (expiry is strictly >)
    const r = computeNotesFreshness("0.1.4", { version: "0.1.5", at }, "0.1.5", NOW);
    assert.deepStrictEqual(r, { unseen: true, firstShownAt: at });
  });

  test("new version more than 24h after first sighting has expired", () => {
    const at = NOW - NOTES_BADGE_TTL_MS - 1;
    const r = computeNotesFreshness("0.1.4", { version: "0.1.5", at }, "0.1.5", NOW);
    assert.strictEqual(r.unseen, false);
  });

  test("a firstShown stamp for a stale version is ignored (restamps now)", () => {
    const r = computeNotesFreshness("0.1.3", { version: "0.1.4", at: 5 }, "0.1.5", NOW);
    assert.deepStrictEqual(r, { unseen: true, firstShownAt: NOW });
  });
});
