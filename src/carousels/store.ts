import fs from 'node:fs';
import path from 'node:path';
import { carouselSpecSchema, type CarouselSpec } from '../domain.js';
const dir = path.resolve('.data/carousels');
export function saveCarousel(spec: CarouselSpec) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${spec.id}.json`), JSON.stringify(spec, null, 2) + '\n'); }
export function loadCarousel(id: string): CarouselSpec { const parsed = carouselSpecSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'))); return parsed; }
