import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { carouselSpecSchema, type AssetRecord, type CarouselSpec } from '../domain.js';
import { validateTemplateConstraints } from '../templates/registry.js';
import { DESIGN } from './tokens.js';

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
function lines(value: string, max = 27): string[] { const words = value.split(/\s+/); const result: string[] = []; let line = ''; for (const word of words) { if ((line + ' ' + word).trim().length > max && line) { result.push(line); line = word; } else line = (line + ' ' + word).trim(); } if (line) result.push(line); return result; }
function textBlock(value: string | null | undefined, x: number, y: number, size: number, fill: string, maxChars: number, weight = 500) { if (!value) return ''; return lines(value, maxChars).map((line, index) => `<text x="${x}" y="${y + index * size * DESIGN.typography.lineHeight}" font-family="${DESIGN.typography.family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join(''); }
function overlay(spec: CarouselSpec, position: number, personaName: string): Buffer {
  const slide = spec.slides[position - 1]; if (!slide) throw new Error(`Missing slide ${position}`);
  const tint = position % 3 === 0 ? DESIGN.colors.warm : DESIGN.colors.accent;
  const items = slide.items?.length ? slide.items.map((item, index) => `<text x="${DESIGN.spacing.outer}" y="${820 + index * 64}" font-family="${DESIGN.typography.family}" font-size="32" fill="${DESIGN.colors.ink}">${index + 1}. ${escapeXml(item)}</text>`).join('') : '';
  const body = slide.body ?? slide.subheadline ?? '';
  return Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1350" fill="${DESIGN.colors.paper}" fill-opacity=".35"/><rect x="54" y="54" width="972" height="1242" rx="42" fill="#fffdf9" fill-opacity=".76"/><rect x="82" y="82" width="110" height="12" rx="6" fill="${tint}"/><text x="82" y="150" font-family="${DESIGN.typography.family}" font-size="24" letter-spacing="4" fill="${DESIGN.colors.muted}">${escapeXml(personaName.toUpperCase())} · CORTIFREE</text>${textBlock(slide.headline, 82, 280, position === 1 ? 80 : 64, DESIGN.colors.ink, position === 1 ? 23 : 28, 700)}${textBlock(body, 82, 560, 34, DESIGN.colors.muted, 38, 500)}${items}<text x="82" y="1240" font-family="${DESIGN.typography.family}" font-size="24" fill="${DESIGN.colors.muted}">${position} / ${spec.slides.length}</text></svg>`);
}
async function imageLayer(asset: AssetRecord | undefined): Promise<Buffer | undefined> { if (!asset || asset.source_type === 'persona_master' || asset.source_type === 'persona_reference' || asset.source_type === 'visual_reference') return undefined; try { return await sharp(asset.path).resize(DESIGN.canvas.width, DESIGN.canvas.height, { fit: 'cover', position: 'attention' }).modulate({ brightness: 1.04, saturation: 0.92 }).jpeg({ quality: 88 }).toBuffer(); } catch { return undefined; } }
export type RenderResult = { outputDir: string; slides: string[]; warnings: string[] };
export async function renderCarousel(specInput: CarouselSpec, assets: AssetRecord[], driveRoot: string, personaName: string): Promise<RenderResult> {
  const spec = carouselSpecSchema.parse(specInput); const warnings: string[] = [];
  spec.slides.forEach(validateTemplateConstraints);
  const inProgress = path.join(driveRoot, '04_IN_PROGRESS', spec.id); const ready = path.join(driveRoot, '05_READY_TO_POST', spec.id);
  await fs.rm(inProgress, { recursive: true, force: true }); await fs.mkdir(inProgress, { recursive: true });
  const slides: string[] = [];
  for (const slide of spec.slides) {
    const asset = slide.asset_id ? assets.find((item) => item.id === slide.asset_id) : assets[slide.position - 1] ?? assets[0];
    if ((!asset || asset.source_type === 'persona_master' || asset.source_type === 'persona_reference' || asset.source_type === 'visual_reference') && validateTemplateConstraints(slide).requires_image) warnings.push(`No final-use asset resolved for slide ${slide.position}`);
    const background = await imageLayer(asset);
    const base = background ?? await sharp({ create: { width: 1080, height: 1350, channels: 4, background: DESIGN.colors.paper } }).png().toBuffer();
    const output = path.join(inProgress, `slide_${String(slide.position).padStart(2, '0')}.png`);
    await sharp(base).composite([{ input: overlay(spec, slide.position, personaName), blend: 'over' }]).png().toFile(output); slides.push(output);
  }
  await fs.writeFile(path.join(inProgress, 'caption.txt'), spec.caption + '\n');
  await fs.writeFile(path.join(inProgress, 'metadata.json'), JSON.stringify({ ...spec, render: { width: 1080, height: 1350, asset_ids: spec.slides.map((slide) => slide.asset_id ?? assets[slide.position - 1]?.id ?? null), warnings } }, null, 2) + '\n');
  const qa = await renderQa(inProgress, spec.slides.length); if (!qa.ok) throw new Error(`Render QA failed: ${qa.errors.join('; ')}`);
  await fs.rm(ready, { recursive: true, force: true }); await fs.cp(inProgress, ready, { recursive: true });
  return { outputDir: ready, slides: slides.map((file) => path.join(ready, path.basename(file))), warnings };
}
export async function renderQa(dir: string, expectedSlides: number): Promise<{ ok: boolean; errors: string[] }> { const errors: string[] = []; const files = (await fs.readdir(dir)).filter((file) => /^slide_\d{2}\.png$/.test(file)).sort(); if (files.length !== expectedSlides) errors.push(`expected ${expectedSlides} slides, found ${files.length}`); for (const file of files) { try { const meta = await sharp(path.join(dir, file)).metadata(); if (meta.width !== 1080 || meta.height !== 1350) errors.push(`${file} is ${meta.width}x${meta.height}, expected 1080x1350`); } catch (error) { errors.push(`${file} is not decodable: ${error instanceof Error ? error.message : String(error)}`); } } return { ok: errors.length === 0, errors }; }
