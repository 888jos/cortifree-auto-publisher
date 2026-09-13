import fs from "node:fs";
import path from "node:path";
import personas from "../config/personas.json" with { type: "json" };
import { personaConfigSchema } from "../src/domain.js";
import { loadEnv } from "../src/config/env.js";
import { resolveDriveLayout } from "../src/config/paths.js";

const env = loadEnv();
const layout = resolveDriveLayout(env.DRIVE_ROOT);
const configDir = layout["10_PERSONA_CONFIG"] ?? path.join(env.DRIVE_ROOT, "10_PERSONA_CONFIG");
fs.mkdirSync(configDir, { recursive: true });
for (const raw of personas) {
  const persona = personaConfigSchema.parse(raw);
  const file = path.join(configDir, `${persona.id}_${persona.name.toUpperCase()}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, `${JSON.stringify(persona, null, 2)}\n`);
}
const allPath = path.join(configDir, "ALL_PERSONAS.json");
if (!fs.existsSync(allPath)) fs.writeFileSync(allPath, `${JSON.stringify(personas.map((persona) => ({ id: persona.id, name: persona.name })), null, 2)}\n`);
console.log(`Persona configs available in ${configDir}`);
