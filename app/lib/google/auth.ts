import crypto from "node:crypto";

type CachedToken = { accessToken: string; expiresAt: number };
let cached: CachedToken | null = null;
const DEFAULT_GOOGLE_SERVICE_ACCOUNT_EMAIL = "cortifree@cortifree-509021.iam.gserviceaccount.com";

function b64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function googleServiceAccountConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export async function getGoogleAccessToken() {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.accessToken;
  const email = DEFAULT_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!rawKey) throw new Error("Google service account private key is not configured");
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { access_token: string; expires_in?: number };
  cached = { accessToken: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.accessToken;
}

export async function googleFetch(url: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Google API failed ${response.status}: ${await response.text()}`);
  return response;
}
