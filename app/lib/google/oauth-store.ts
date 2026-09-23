import crypto from "node:crypto";
import { dataBackend } from "../data-backend";

const STAGE = "GOOGLE_OAUTH_REFRESH_TOKEN";
function key() {
  const seed = process.env.TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!seed) throw new Error("No token encryption key configured");
  return crypto.createHash("sha256").update(seed).digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
function decrypt(value: string) {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted OAuth token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
export async function storeGoogleRefreshToken(token: string) {
  const response = await dataBackend("system_logs", { method: "POST", body: JSON.stringify({ created_at: new Date().toISOString(), stage: STAGE, status: "STORED", metadata: { encrypted_refresh_token: encrypt(token), storage: "encrypted_backend" } }) });
  if (!response.ok) throw new Error(`OAuth token storage failed: ${await response.text()}`);
}
export async function loadGoogleRefreshToken() {
  const response = await dataBackend(`system_logs?stage=eq.${STAGE}&order=created_at.desc&limit=1`);
  if (!response.ok) return null;
  const [row] = await response.json() as Array<Record<string, unknown>>;
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  const encrypted = typeof metadata.encrypted_refresh_token === "string" ? metadata.encrypted_refresh_token : "";
  return encrypted ? decrypt(encrypted) : null;
}
