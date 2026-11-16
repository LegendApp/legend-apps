// Build-time only: bakes a font's outlines into a Journey Text3D font module.
//   NODE_PATH=/path/to/tools/node_modules node packages/slides-effects/scripts/journey-text3d.cjs <font.ttf|otf> <LICENSE.txt> <out.ts> [name]
// Requires opentype.js@1.3.4 and earcut@3.0.1 (install them in a tools directory; NODE_PATH points there).
// The module stores flattened outlines with per-point shading normals and miter offsets, plus cap triangles;
// the Text3D shader builds the caps, bevels and sides from them, so depth and bevel stay runtime options.
const fs = require("node:fs");
const path = require("node:path");
const opentype = require("opentype.js");
const earcutModule = require("earcut");
const earcut = earcutModule.default ?? earcutModule;

const extras = "·×–—…‘’“”•→←";
const tolerance = 0.0015; // em, maximum distance from the curve
const cornerCosine = Math.cos(32 * Math.PI / 180); // sharper turns split the shading normal
const quantum = 8192; // Int16 positions in 1/8192 em (range ±4 em)

function flatten(commands, scale) {
  const contours = [];
  let contour = null, x = 0, y = 0;
  const push = (px, py) => { const last = contour[contour.length - 1]; if (!last || Math.hypot(last[0] - px, last[1] - py) > 1e-6) contour.push([px, py]); };
  const steps = (length) => Math.max(1, Math.min(24, Math.ceil(Math.sqrt(length / (8 * tolerance)))));
  for (const c of commands) {
    if (c.type === "M") { if (contour?.length) contours.push(contour); contour = []; x = c.x * scale; y = c.y * scale; push(x, y); }
    else if (c.type === "L") { x = c.x * scale; y = c.y * scale; push(x, y); }
    else if (c.type === "Q") {
      const x1 = c.x1 * scale, y1 = c.y1 * scale, x2 = c.x * scale, y2 = c.y * scale;
      const n = steps(Math.hypot(x - 2 * x1 + x2, y - 2 * y1 + y2));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; push(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2); }
      x = x2; y = y2;
    } else if (c.type === "C") {
      const x1 = c.x1 * scale, y1 = c.y1 * scale, x2 = c.x2 * scale, y2 = c.y2 * scale, x3 = c.x * scale, y3 = c.y * scale;
      const n = steps(Math.max(Math.hypot(x - 2 * x1 + x2, y - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3)) * 1.5);
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      x = x3; y = y3;
    } else if (c.type === "Z") { if (contour?.length) contours.push(contour); contour = null; }
  }
  if (contour?.length) contours.push(contour);
  return contours.map(points => {
    const first = points[0], last = points[points.length - 1];
    if (points.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) points.pop();
    return points;
  }).filter(points => points.length >= 3 && Math.abs(area(points)) > 1e-7);
}
function area(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; sum += a[0] * b[1] - b[0] * a[1]; }
  return sum / 2;
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
const normalize = ([x, y]) => { const length = Math.hypot(x, y) || 1; return [x / length, y / length]; };

/** Outer contours counter-clockwise and holes clockwise, so (dy, -dx) always points out of the solid. */
function bakeGlyph(contours) {
  const depth = contours.map((contour, index) => contours.reduce((count, other, j) => count + (j !== index && Math.abs(area(other)) > Math.abs(area(contour)) && inside(contour[0], other) ? 1 : 0), 0));
  const oriented = contours.map((contour, index) => (area(contour) > 0) === (depth[index] % 2 === 0) ? contour : contour.slice().reverse());
  const points = [], segments = [], triangles = [];
  const firstCopy = []; // contour-local unique point -> emitted index (for caps)
  oriented.forEach((contour, c) => {
    const n = contour.length, copies = [];
    const edgeNormal = i => { const a = contour[i], b = contour[(i + 1) % n]; return normalize([b[1] - a[1], a[0] - b[0]]); };
    for (let i = 0; i < n; i++) {
      const incoming = edgeNormal((i - 1 + n) % n), outgoing = edgeNormal(i);
      const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
      const sum = [incoming[0] + outgoing[0], incoming[1] + outgoing[1]];
      let miter = [sum[0] / (1 + dot), sum[1] / (1 + dot)];
      const length = Math.hypot(...miter);
      if (!(length < 3)) miter = length > 0 && Number.isFinite(length) ? [miter[0] / length * 3, miter[1] / length * 3] : outgoing;
      const [x, y] = contour[i];
      if (dot < cornerCosine) {
        copies.push([points.length, points.length + 1]);
        points.push([x, y, ...incoming, ...miter], [x, y, ...outgoing, ...miter]);
      } else {
        copies.push([points.length, points.length]);
        points.push([x, y, ...normalize(sum), ...miter]);
      }
    }
    for (let i = 0; i < n; i++) segments.push([copies[i][1], copies[(i + 1) % n][0]]);
    firstCopy[c] = copies.map(copy => copy[0]);
  });
  // Caps: each outer contour with the holes directly inside it.
  oriented.forEach((contour, c) => {
    if (depth[c] % 2) return;
    const holes = oriented.map((hole, h) => h).filter(h => depth[h] === depth[c] + 1 && inside(oriented[h][0], contour));
    const flat = [], map = [], holeStarts = [];
    for (const index of [c, ...holes]) {
      if (index !== c) holeStarts.push(flat.length / 2);
      oriented[index].forEach((point, i) => { flat.push(point[0], point[1]); map.push(firstCopy[index][i]); });
    }
    const indices = earcut(flat, holeStarts, 2);
    for (let i = 0; i < indices.length; i += 3) triangles.push([map[indices[i]], map[indices[i + 1]], map[indices[i + 2]]]);
  });
  if (points.length >= 1024) throw new Error("Glyph has too many outline points");
  return { points, segments, triangles };
}

function main() {
  const [fontFile, licenseFile, output, nameArg] = process.argv.slice(2);
  if (!fontFile || !licenseFile || !output) throw new Error("Usage: journey-text3d.cjs <font.ttf|otf> <LICENSE.txt> <out.ts> [name]");
  const font = opentype.parse(fs.readFileSync(fontFile).buffer.slice(0));
  const scale = 1 / font.unitsPerEm;
  const name = nameArg ?? `${font.names.fontFamily?.en ?? "Font"} ${font.names.fontSubfamily?.en ?? ""}`.trim();
  const ascii = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join("");
  const chars = [...ascii + extras].filter(ch => font.charToGlyphIndex(ch) > 0).join("");
  const header = [], words = [], kerning = {};
  const glyphs = [...chars].map(ch => font.charToGlyph(ch));
  for (const glyph of glyphs) {
    const baked = bakeGlyph(flatten(glyph.path.commands, scale));
    header.push([Math.round(glyph.advanceWidth * scale * 1e5) / 1e5, baked.points.length, baked.segments.length, baked.triangles.length]);
    for (const p of baked.points) words.push(Math.round(p[0] * quantum), Math.round(p[1] * quantum), Math.round(p[2] * 32767), Math.round(p[3] * 32767), Math.round(p[4] * 8191), Math.round(p[5] * 8191));
    for (const s of baked.segments) words.push(s[0], s[1]);
    for (const t of baked.triangles) words.push(t[0], t[1], t[2]);
  }
  const all = [" ", ...chars];
  const allGlyphs = all.map(ch => font.charToGlyph(ch));
  for (let a = 0; a < all.length; a++) for (let b = 0; b < all.length; b++) {
    const value = font.getKerningValue(allGlyphs[a], allGlyphs[b]);
    if (value) kerning[all[a] + all[b]] = Math.round(value * scale * 1e5) / 1e5;
  }
  // Hex keeps the data to the letters a-f, so it never spells words a text search could trip on.
  const data = Buffer.from(new Int16Array(words).buffer).toString("hex");
  const hash = require("node:crypto").createHash("sha256").update(fs.readFileSync(fontFile)).digest("hex");
  const metrics = { ascent: font.ascender * scale, descent: font.descender * scale, capHeight: (font.tables.os2?.sCapHeight || font.ascender * 0.7) * scale };
  const round = (_key, value) => typeof value === "number" ? Math.round(value * 1e5) / 1e5 : value;
  fs.writeFileSync(output, `// Generated by packages/slides-effects/scripts/journey-text3d.cjs from ${path.basename(fontFile)} (SHA-256 ${hash}).\n` +
    `// Per glyph: advance (em), outline points, side segments, cap triangles. Data is little-endian Int16 as hex: points (x, y in 1/${quantum} em;\n` +
    `// shading normal in 1/32767; miter in 1/8191), then segment index pairs, then triangle index triples.\n` +
    `export const font = { name: ${JSON.stringify(name)}, chars: ${JSON.stringify(chars)}, space: ${round("", font.charToGlyph(" ").advanceWidth * scale)},\n` +
    `  ascent: ${round("", metrics.ascent)}, descent: ${round("", metrics.descent)}, capHeight: ${round("", metrics.capHeight)},\n` +
    `  glyphs: ${JSON.stringify(header)},\n  kerning: ${JSON.stringify(kerning)},\n  data: "${data}",\n` +
    `  license: ${JSON.stringify(fs.readFileSync(licenseFile, "utf8"))} };\n`);
  console.log(JSON.stringify({ name, glyphs: chars.length, points: header.reduce((s, g) => s + g[1], 0), bytes: words.length * 2, maxTriangles: Math.max(...header.map(g => g[3])), maxSegments: Math.max(...header.map(g => g[2])) }));
}
main();
