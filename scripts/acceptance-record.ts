import { recordAcceptanceGate } from "../src/autonomy/acceptance";

function numberArg(name: string, fallback?: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
    ?? process.env[name.toUpperCase()];
  if (raw === undefined || raw === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

const reviewed = numberArg("reviewed");
const usable = numberArg("usable");
const batchId = process.env.ACCEPTANCE_BATCH_ID || process.argv.find((arg) => arg.startsWith("--batch-id="))?.slice("--batch-id=".length);
const notes = process.env.ACCEPTANCE_NOTES || process.argv.find((arg) => arg.startsWith("--notes="))?.slice("--notes=".length);

const result = await recordAcceptanceGate({ reviewed, usable, batchId, notes });
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 2;
