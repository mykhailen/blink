import type { StatusDisplay } from "./statusStore.js";

/** Max characters shown for the model name before it is ellipsized. */
const MODEL_NAME_MAX = 24;

function truncateModel(model: string): string {
  return model.length > MODEL_NAME_MAX
    ? model.slice(0, MODEL_NAME_MAX - 1) + "…"
    : model;
}

function fileToggleLink(display: StatusDisplay): string | undefined {
  if (!display.filePattern) { return undefined; }
  if (display.matchedPattern) {
    const arg = encodeURIComponent(JSON.stringify([display.matchedPattern]));
    return `[$(blink-logo) Enable for ${display.matchedPattern}](command:blink.enableForFileType?${arg})`;
  }
  const arg = encodeURIComponent(JSON.stringify([display.filePattern]));
  return `[$(blink-disabled) Disable for ${display.filePattern}](command:blink.disableForFileType?${arg})`;
}

function whatsNewSection(display: StatusDisplay): string | undefined {
  const wn = display.whatsNew;
  // Unread-only: marking as read (or the 24 h expiry) drops the whole section.
  if (!wn?.unseen) { return undefined; }
  const links = [
    "[$(book) Full changelog](command:blink.openChangelog)",
    "[$(check) Mark as read](command:blink.markNotesSeen)",
  ];
  return [
    `**What's New in ${wn.version}**`,
    wn.bullets.map((b) => `- ${b}`).join("\n"),
    links.join(" &emsp;|&emsp; "),
  ].join("\n\n");
}

/**
 * Build the Markdown for the status bar item's hover tooltip, styled after the
 * TypeScript status bar tooltip: header (name + version + config link), the
 * current model with a switch link, an optional What's New row (newest
 * CHANGELOG section), and the enable/disable action — each on its own row,
 * separated by horizontal rules, with its action link inline. Pure (returns a
 * string) so it is unit-testable; the caller wraps it in a trusted
 * MarkdownString with theme-icon support.
 */
export function renderTooltipMarkdown(display: StatusDisplay, version: string): string {
  const settingsArg = encodeURIComponent(JSON.stringify("blink"));
  const toggle = display.enabled
    ? "[$(blink-disabled) Disable](command:blink.disable)"
    : "[$(blink-logo) Enable](command:blink.enable)";
  const model = truncateModel(display.model || "no model");
  const actions = [
    `[$(gear) Settings](command:workbench.action.openSettings?${settingsArg})`,
    toggle,
  ];
  const fileToggle = fileToggleLink(display);
  if (fileToggle) { actions.push(fileToggle); }
  const rows = [
    `**${display.icon} Blink** · [v${version}](command:blink.openChangelog)`,
    `---`,
    `[${model} $(chevron-down)](command:blink.switchModel)`,
  ];
  const whatsNew = whatsNewSection(display);
  if (whatsNew) { rows.push(`---`, whatsNew); }
  rows.push(`---`, actions.join(" &emsp;|&emsp; "));
  return rows.join("\n\n");
}
