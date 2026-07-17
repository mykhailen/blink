// One-off generator: media/*.svg glyphs -> media/blink.woff.
// Run with: npm run build:icons
// The .woff is committed, so normal installs/builds do not need this script.
import { createReadStream, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import SVGIcons2SVGFontStream from "svgicons2svgfont";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, "..", "media");
const woffPath = join(mediaDir, "blink.woff");

// Codepoints are part of the public contract: package.json's contributes.icons
// references them as \E000/\E001/\E002/\E003.
const GLYPHS = [
  { file: "blink.svg", name: "blink-logo", codepoint: 0xe000 },
  { file: "blink-issue.svg", name: "blink-issue", codepoint: 0xe001 },
  { file: "blink-disabled.svg", name: "blink-disabled", codepoint: 0xe002 },
  { file: "blink-update.svg", name: "blink-update", codepoint: 0xe003 },
];

const fontStream = new SVGIcons2SVGFontStream({
  fontName: "blink",
  fontHeight: 1000,
  normalize: true,
  centerHorizontally: true,
  log: () => {},
});

let svgFont = "";
fontStream.on("data", (chunk) => { svgFont += chunk; });
fontStream.on("end", () => {
  const ttf = svg2ttf(svgFont, {});
  const woff = ttf2woff(Buffer.from(ttf.buffer));
  writeFileSync(woffPath, Buffer.from(woff.buffer));
  const names = GLYPHS.map((g) => `${g.name}@U+${g.codepoint.toString(16).toUpperCase()}`).join(", ");
  console.log(`Wrote ${woffPath} (${Buffer.from(woff.buffer).length} bytes): ${names}`);
});
fontStream.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

for (const { file, name, codepoint } of GLYPHS) {
  const glyph = createReadStream(join(mediaDir, file));
  // svgicons2svgfont reads glyph name/codepoint from this metadata.
  glyph.metadata = { unicode: [String.fromCodePoint(codepoint)], name };
  fontStream.write(glyph);
}
fontStream.end();
