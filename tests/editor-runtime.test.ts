import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('carousel editor runtime resilience', () => {
  it('keeps browser-edited text isolated from React-managed handles', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'app/editor/[id]/page.tsx'), 'utf8');
    assert.doesNotMatch(source, /<div contentEditable=/);
    assert.match(source, /className="ce-inline-text" contentEditable=/);
    assert.match(source, /headlineEditRef/);
    assert.match(source, /bodyEditRef/);
  });

  it('uses the same canonical geometry and typography resolver as final rendering', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'app/editor/[id]/page.tsx'), 'utf8');
    assert.match(source, /getSlideGeometry/);
    assert.match(source, /typographyForCarousel/);
    assert.match(source, /getSlideGeometry\(\{\.\.\.gen,layout\},isHook,isVisualFinal,typographyForCarousel\(id\)\)/);
    assert.match(source, /three-rect-educational.*\{x:80,y:110,width:450,height:430\}/s);
    assert.match(source, /grid-2x2.*\{x:32,y:32,width:500,height:635\}/s);
  });

  it('keeps the v6 editor hierarchy focused on canvas and contextual actions', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'app/editor/[id]/page.tsx'), 'utf8');
    const css = await fs.readFile(path.join(process.cwd(), 'app/editor/[id]/editor.css'), 'utf8');
    assert.match(source, /zoomMode/);
    assert.match(source, /Ancien rendu/);
    assert.match(source, /ce-layer-details/);
    assert.match(source, /ce-advanced/);
    assert.match(source, /Image source introuvable/);
    assert.match(source, /Choisir une image/);
    assert.match(css, /grid-template-columns:164px minmax\(520px,1fr\) 350px/);
    assert.match(css, /\.ce-assets\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  });
});
