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
});
