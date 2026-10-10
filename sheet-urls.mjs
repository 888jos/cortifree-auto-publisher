import sharp from "sharp";
const urls = process.argv.slice(3);
const T = 360, H = 450, G = 8;
const tiles = await Promise.all(urls.map(async (u, i) => ({ input: await sharp(Buffer.from(await (await fetch(u)).arrayBuffer())).resize(T, H).png().toBuffer(), left: (i % 4) * (T + G), top: Math.floor(i / 4) * (H + G) })));
await sharp({ create: { width: 4 * (T + G), height: Math.ceil(urls.length / 4) * (H + G), channels: 3, background: "#888" } }).composite(tiles).jpeg({ quality: 82 }).toFile(process.argv[2]);
