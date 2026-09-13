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

export class SupabaseAssetStorage implements AssetStorageProvider {
  readonly name = 'supabase_storage';
  constructor(private readonly options: { url: string; serviceRoleKey: string; bucket: string }) {}

  private objectUrl(storagePath: string, publicObject = false) {
    const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
    return `${this.options.url}/storage/v1/${publicObject ? 'object/public' : 'object'}/${this.options.bucket}/${encoded}`;
  }

  async putIfAbsent(input: { storagePath: string; bytes: Uint8Array; contentType: string }) {
    const target = this.objectUrl(input.storagePath);
    const headers = { apikey: this.options.serviceRoleKey, Authorization: `Bearer ${this.options.serviceRoleKey}` };
    const exists = await fetch(target, { method: 'HEAD', headers });
    if (exists.ok) return { created: false, publicUrl: this.objectUrl(input.storagePath, true) };
    if (exists.status !== 400 && exists.status !== 404) throw new Error(`Storage check failed: ${exists.status}`);
    const response = await fetch(target, { method: 'POST', headers: { ...headers, 'Content-Type': input.contentType, 'x-upsert': 'false' }, body: new Uint8Array(input.bytes) });
    if (!response.ok) throw new Error(`Storage upload failed: ${(await response.text()).slice(0, 500)}`);
    return { created: true, publicUrl: this.objectUrl(input.storagePath, true) };
  }
}
