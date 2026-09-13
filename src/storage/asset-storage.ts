import fs from 'node:fs/promises';
import path from 'node:path';

export interface AssetStorageProvider {
  readonly name: string;
  putIfAbsent(input: { storagePath: string; bytes: Uint8Array; contentType: string }): Promise<{ created: boolean; publicUrl: string }>;
}

export class LocalDriveAssetStorage implements AssetStorageProvider {
  readonly name = 'local_drive';
  constructor(private readonly root: string) {}

  async putIfAbsent(input: { storagePath: string; bytes: Uint8Array; contentType: string }) {
    const segments = input.storagePath.split('/');
    if (segments.includes('00_MASTER')) throw new Error('MASTER writes are prohibited');
    const target = path.resolve(this.root, input.storagePath);
    const relative = path.relative(path.resolve(this.root), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Storage path escapes Drive root');
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.writeFile(target, input.bytes, { flag: 'wx' });
      return { created: true, publicUrl: target };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return { created: false, publicUrl: target };
    }
  }
}
