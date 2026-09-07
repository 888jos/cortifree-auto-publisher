import fs from 'node:fs';
import path from 'node:path';
import { accountSchema, type Account } from '../domain.js';
export function loadAccounts(file = path.resolve('config/accounts.json')): Account[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('config/accounts.json must contain an array');
  return raw.map((value, index) => { const parsed = accountSchema.safeParse(value); if (!parsed.success) throw new Error(`Invalid account at index ${index}: ${parsed.error.message}`); return parsed.data; });
}
