import sharp from "sharp";
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const H = 360, GAP = 10;
const lines = [];
let y = 0, maxW = 0;
for (const row of rows) {
  let x = 0;
  for (const url of [row.master, row.ref, row.gen]) {
    const res = await fetch(url);
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize({ height: H }).png().toBuffer();
    const w = (await sharp(buf).metadata()).width;
    lines.push({ input: buf, left: x, top: y + 28 });
    x += w + GAP;
  }
  const label = Buffer.from(`<svg width="900" height="26" xmlns="http://www.w3.org/2000/svg"><text x="4" y="19" font-family="Arial" font-size="17" font-weight="700">#${row.asset_id} · ${row.persona_id} · ${row.category}   (master | référence | généré)</text></svg>`);
  lines.push({ input: label, left: 0, top: y });
  maxW = Math.max(maxW, x); y += H + 28 + GAP * 2;
}
await sharp({ create: { width: Math.max(maxW, 900), height: y, channels: 3, background: "#fff" } }).composite(lines).jpeg({ quality: 80 }).toFile(process.argv[3]);
