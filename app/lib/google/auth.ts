import crypto from "node:crypto";

type CachedToken = { accessToken: string; expiresAt: number };
let cached: CachedToken | null = null;
let userCached: CachedToken | null = null;
const DEFAULT_GOOGLE_SERVICE_ACCOUNT_EMAIL = "cortifree@cortifree-509021.iam.gserviceaccount.com";

function googleCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as { client_email?: string; private_key?: string };
      if (parsed.private_key) return { email: parsed.client_email || DEFAULT_GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey: parsed.private_key };
    } catch {
      // Fall through to the split environment variables for backwards compatibility.
    }
  }
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!rawKey) return null;
  return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || DEFAULT_GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey: rawKey };
}

function b64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function googleServiceAccountConfigured() {
  return Boolean(googleCredentials());
}

export function googleServiceAccountIdentity() {
  const credentials = googleCredentials();
  return credentials ? { email: credentials.email, privateKeyPresent: Boolean(credentials.privateKey) } : null;
}

export function googleUserOAuthConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
}

export function googleOAuthRedirectUri(origin?: string) {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin || process.env.NEXT_PUBLIC_APP_URL || "https://cortifree-auto-publisher.vercel.app"}/api/google/oauth/callback`;
}

export function googleOAuthAuthorizationUrl(state: string, origin?: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: googleOAuthRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/drive",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function signedOAuthState() {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  const secret = process.env.OAUTH_STATE_SECRET || process.env.CORTIFREE_ADMIN_SECRET || "cortifree-oauth-state";
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${b64url(payload)}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return false;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const secret = process.env.OAUTH_STATE_SECRET || process.env.CORTIFREE_ADMIN_SECRET || "cortifree-oauth-state";
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const timestamp = Number(payload.split(".", 1)[0]);
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) && Number.isFinite(timestamp) && Date.now() - timestamp < 10 * 60 * 1000;
}

export async function exchangeGoogleOAuthCode(code: string, origin?: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      redirect_uri: googleOAuthRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth code exchange failed: ${response.status} ${await response.text()}`);
  return await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function getGoogleUserAccessToken() {
  if (userCached && userCached.expiresAt - Date.now() > 60_000) return userCached.accessToken;
  if (!googleUserOAuthConfigured()) throw new Error("Google user OAuth is not configured; set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google user OAuth refresh failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { access_token: string; expires_in?: number };
  userCached = { accessToken: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return userCached.accessToken;
}

export async function getGoogleAccessToken() {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.accessToken;
  const credentials = googleCredentials();
  if (!credentials) throw new Error("Google service account credentials are not configured");
  const email = credentials.email;
  const privateKey = credentials.privateKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive",
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

export async function googleFetchAsUser(url: string, init: RequestInit = {}) {
  const accessToken = await getGoogleUserAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Google user API failed ${response.status}: ${await response.text()}`);
  return response;
}
