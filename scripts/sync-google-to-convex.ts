import { syncEditorialSheetToConvex } from "../app/lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../app/lib/sync/drive";

const allowedScopes = ["all", "sheet", "assets", "stock", "stock_missing", "visual_refs", "visual_refs_missing", "app_screens"] as const;
type Scope = (typeof allowedScopes)[number];

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const personaArg = process.argv.find((arg) => arg.startsWith("--persona="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 100);
const requestedScope = (scopeArg?.split("=")[1] ?? "all") as Scope;
const personaId = personaArg?.split("=")[1]?.trim().toUpperCase() || undefined;
if (personaId && !/^P\d{2}$/.test(personaId)) throw new Error("Invalid --persona; expected P01..P16");
if (!allowedScopes.includes(requestedScope)) {
  throw new Error(`Invalid --scope=${requestedScope}. Allowed: ${allowedScopes.join(", ")}`);
}
if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid --limit");

const editorial = requestedScope === "all" || requestedScope === "sheet"
  ? await syncEditorialSheetToConvex()
  : { status: "SKIPPED", reason: "Drive-only scoped sync" };

const drive = requestedScope === "sheet"
  ? { status: "SKIPPED", reason: "Sheet-only sync" }
  : await syncGoogleDriveToConvex({ limit, scope: requestedScope, personaId });

console.log(JSON.stringify({ scope: requestedScope, persona_id: personaId ?? null, limit, editorial, drive }, null, 2));
