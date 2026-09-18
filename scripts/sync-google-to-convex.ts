import { syncEditorialSheetToConvex } from "../app/lib/sync/editorial";
import { syncGoogleDriveToConvex } from "../app/lib/sync/drive";

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number(process.env.GOOGLE_DRIVE_SYNC_BATCH ?? 100);

const editorial = await syncEditorialSheetToConvex();
const drive = await syncGoogleDriveToConvex({ limit });
console.log(JSON.stringify({ editorial, drive }, null, 2));
