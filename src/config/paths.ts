import fs from 'node:fs';
import path from 'node:path';

export const EXPECTED_DRIVE_DIRS = ['01_STOCK_ASSETS', '02_PERSONAS', '03_TEMPLATES', '04_IN_PROGRESS', '05_READY_TO_POST', '06_POSTED', '07_WINNERS', '08_ARCHIVE', '09_VISUAL_REFERENCES', '10_PERSONA_CONFIG'] as const;
export type DriveLayout = Record<(typeof EXPECTED_DRIVE_DIRS)[number], string | undefined> & { root: string };
function normalizedChild(root: string, expected: string): string | undefined {
  if (!fs.existsSync(root)) return undefined;
  const matches = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.trim() === expected);
  if (matches.length > 1) throw new Error(`Ambiguous Drive directory for ${expected}: ${matches.map((m) => JSON.stringify(m.name)).join(', ')}`);
  return matches[0] ? path.join(root, matches[0].name) : undefined;
}
export function resolveDriveLayout(root: string): DriveLayout {
  const layout = { root } as DriveLayout;
  for (const name of EXPECTED_DRIVE_DIRS) layout[name] = normalizedChild(root, name);
  return layout;
}
export const projectPath = (...parts: string[]) => path.resolve(process.cwd(), ...parts);
