import sharp from "sharp";

export type HookDesign = {
  format: string;
  x: number;
  y: number;
  width: number;
  size: number;
  weight: number;
  maxWordsPerLine: number;
  lineGap: number;
  align: "left" | "center" | "right";
  textColor: string;
  accentColor: string;
  hookColor: string;
};

const pastelAccents = ["#FFE26E", "#BCE8FF", "#FFB6D5", "#FFFFFF"];

const formats = [
  { name: "right_stack", y: 300, size: 44, width: 360, maxWords: 2, gap: 4 },
  { name: "left_stack", y: 300, size: 44, width: 360, maxWords: 2, gap: 4 },
  { name: "right_air", y: 190, size: 38, width: 390, maxWords: 2, gap: 3 },
  { name: "left_air", y: 190, size: 38, width: 390, maxWords: 2, gap: 3 },
  { name: "right_bold", y: 480, size: 54, width: 360, maxWords: 1, gap: 0 },
  { name: "left_bold", y: 480, size: 54, width: 360, maxWords: 1, gap: 0 },
  { name: "right_small_steps", y: 250, size: 34, width: 390, maxWords: 2, gap: 2 },
  { name: "left_small_steps", y: 250, size: 34, width: 390, maxWords: 2, gap: 2 },
  { name: "center_editorial", y: 420, size: 42, width: 860, maxWords: 2, gap: 3 },
  { name: "bottom_editorial", y: 850, size: 40, width: 920, maxWords: 2, gap: 3 },
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function luminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export async function analyzeHookComposition(imageBytes: Buffer, seed: string): Promise<HookDesign> {
  const { data, info } = await sharp(imageBytes).resize({ width: 32, height: 48, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let leftLuma = 0, rightLuma = 0, leftEdges = 0, rightEdges = 0, leftCount = 0, rightCount = 0;
  let leftRgb = [0, 0, 0], rightRgb = [0, 0, 0];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const rgb = [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
      const value = luminance(rgb[0]!, rgb[1]!, rgb[2]!);
      const isLeft = x < info.width / 2;
      if (isLeft) { leftLuma += value; leftCount += 1; leftRgb = leftRgb.map((sum, i) => sum + rgb[i]!); }
      else { rightLuma += value; rightCount += 1; rightRgb = rightRgb.map((sum, i) => sum + rgb[i]!); }
      if (x > 0) {
        const previousOffset = (y * info.width + x - 1) * info.channels;
        const previous = luminance(data[previousOffset] ?? 0, data[previousOffset + 1] ?? 0, data[previousOffset + 2] ?? 0);
        if (Math.abs(value - previous) > 28) { if (isLeft) leftEdges += 1; else rightEdges += 1; }
      }
    }
  }
  const leftScore = leftEdges / Math.max(1, leftCount) + (leftLuma / Math.max(1, leftCount) > 215 ? 0.08 : 0);
  const rightScore = rightEdges / Math.max(1, rightCount) + (rightLuma / Math.max(1, rightCount) > 215 ? 0.08 : 0);
  const side = leftScore <= rightScore ? "left" : "right";
  const zoneLuma = side === "left" ? leftLuma / leftCount : rightLuma / rightCount;
  const zoneRgb = (side === "left" ? leftRgb : rightRgb).map((value) => value / (side === "left" ? leftCount : rightCount));
  const format = formats[hash(seed) % formats.length]!;
  const useCenter = format.name === "center_editorial";
  const useBottom = format.name === "bottom_editorial";
  const x = useCenter || useBottom ? 80 : side === "right" ? 600 : 80;
  const width = useCenter || useBottom ? format.width : format.width;
  const textColor = zoneLuma > 165 ? "#20243A" : "#FFFFFF";
  const distances = pastelAccents.map((color) => {
    const hex = color.slice(1);
    const rgb = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    return rgb.reduce((sum, channel, index) => sum + Math.abs(channel - zoneRgb[index]!), 0);
  });
  const accentColor = pastelAccents[distances.indexOf(Math.max(...distances))]!;
  const hookColor = zoneLuma > 165 ? textColor : accentColor;
  return { format: format.name, x, y: useCenter || useBottom ? format.y : format.y, width, size: format.size, weight: format.name.includes("bold") ? 800 : 700, maxWordsPerLine: format.maxWords, lineGap: format.gap, align: useCenter ? "center" : "left", textColor, accentColor, hookColor };
}
