import * as assert from "assert";
import { isDisabledScheme, matchDisabledFile, patternForFile } from "../config/fileBlacklist.js";

suite("matchDisabledFile", () => {
  test("matches a basename against a *.ext glob", () => {
    assert.strictEqual(matchDisabledFile("README.md", ["*.md"]), "*.md");
  });

  test("returns undefined when nothing matches", () => {
    assert.strictEqual(matchDisabledFile("index.ts", ["*.md", "*.markdown"]), undefined);
  });

  test("returns the first matching pattern", () => {
    assert.strictEqual(matchDisabledFile("notes.md", ["*.txt", "*.md", "notes.*"]), "*.md");
  });

  test("matching is case-insensitive", () => {
    assert.strictEqual(matchDisabledFile("README.MD", ["*.md"]), "*.md");
  });

  test("? matches exactly one character", () => {
    assert.strictEqual(matchDisabledFile("a1.ts", ["a?.ts"]), "a?.ts");
    assert.strictEqual(matchDisabledFile("a12.ts", ["a?.ts"]), undefined);
  });

  test("the pattern must cover the whole basename (no substring match)", () => {
    assert.strictEqual(matchDisabledFile("foo.md.ts", ["*.md"]), undefined);
  });

  test("regex metacharacters in patterns are literal (dot does not become any-char)", () => {
    assert.strictEqual(matchDisabledFile("axmd", ["*.md"]), undefined);
  });

  test("exact-basename entries match files without extensions", () => {
    assert.strictEqual(matchDisabledFile("Makefile", ["Makefile"]), "Makefile");
  });

  test("empty and whitespace-only patterns never match and never throw", () => {
    assert.strictEqual(matchDisabledFile("a.md", ["", "   "]), undefined);
  });

  test("empty pattern list matches nothing", () => {
    assert.strictEqual(matchDisabledFile("a.md", []), undefined);
  });
});

suite("patternForFile", () => {
  test("file with extension -> *.ext", () => {
    assert.strictEqual(patternForFile("index.ts"), "*.ts");
  });

  test("multi-dot name uses the last extension", () => {
    assert.strictEqual(patternForFile("app.test.ts"), "*.ts");
  });

  test("no extension -> exact basename", () => {
    assert.strictEqual(patternForFile("Makefile"), "Makefile");
  });

  test("dotfile counts as extensionless -> exact basename", () => {
    assert.strictEqual(patternForFile(".gitignore"), ".gitignore");
  });

  test("trailing dot -> exact basename", () => {
    assert.strictEqual(patternForFile("weird."), "weird.");
  });
});

suite("isDisabledScheme", () => {
  const defaults = { enableInChat: false, enableInCommitMessage: false, disabledSchemes: [] as string[] };

  test("chat prompt inputs are disabled by default", () => {
    assert.strictEqual(isDisabledScheme("chatSessionInput", defaults), true);
    assert.strictEqual(isDisabledScheme("sessions-chat", defaults), true);
  });

  test("enableInChat re-enables the chat prompt inputs", () => {
    assert.strictEqual(isDisabledScheme("chatSessionInput", { ...defaults, enableInChat: true }), false);
  });

  test("the commit message box is disabled by default", () => {
    assert.strictEqual(isDisabledScheme("vscode-scm", defaults), true);
  });

  test("enableInCommitMessage re-enables the commit message box", () => {
    assert.strictEqual(isDisabledScheme("vscode-scm", { ...defaults, enableInCommitMessage: true }), false);
  });

  test("ordinary editor schemes are never disabled by the defaults", () => {
    assert.strictEqual(isDisabledScheme("file", defaults), false);
    assert.strictEqual(isDisabledScheme("untitled", defaults), false);
    assert.strictEqual(isDisabledScheme("vscode-notebook-cell", defaults), false);
  });

  test("a custom entry in disabledSchemes disables that scheme", () => {
    assert.strictEqual(isDisabledScheme("vscode-interactive-input", { ...defaults, disabledSchemes: ["vscode-interactive-input"] }), true);
  });

  test("a custom entry wins over the checkbox for a built-in scheme", () => {
    assert.strictEqual(isDisabledScheme("chatSessionInput", { enableInChat: true, enableInCommitMessage: false, disabledSchemes: ["chatSessionInput"] }), true);
  });

  test("custom entries are trimmed and compared case-insensitively", () => {
    assert.strictEqual(isDisabledScheme("vscode-scm", { ...defaults, enableInCommitMessage: true, disabledSchemes: [" VSCODE-SCM "] }), true);
    assert.strictEqual(isDisabledScheme("file", { ...defaults, disabledSchemes: ["", "  "] }), false);
  });
});
