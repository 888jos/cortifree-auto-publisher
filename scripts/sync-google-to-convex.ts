import { syncEditorialSheetToConvex } from "../app/lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../app/lib/sync/drive";

const allowedScopes = ["all", "sheet", "assets", "stock", "stock_missing", "visual_refs", "visual_refs_missing"] as const;
type Scope = (typeof allowedScopes)[number];

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 100);
const requestedScope = (scopeArg?.split("=")[1] ?? "all") as Scope;
if (!allowedScopes.includes(requestedScope)) {
  throw new Error(`Invalid --scope=${requestedScope}. Allowed: ${allowedScopes.join(", ")}`);
}
if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid --limit");

const editorial = requestedScope === "all" || requestedScope === "sheet"
  ? await syncEditorialSheetToConvex()
  : { status: "SKIPPED", reason: "Drive-only scoped sync" };

const drive = requestedScope === "sheet"
  ? { status: "SKIPPED", reason: "Sheet-only sync" }
  : await syncGoogleDriveToConvex({ limit, scope: requestedScope });

console.log(JSON.stringify({ scope: requestedScope, limit, editorial, drive }, null, 2));
