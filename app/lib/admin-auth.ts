function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function decodeBasic(value: string) {
  try {
    const decoded = atob(value);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

export function adminPassword() {
  return process.env.CORTIFREE_ADMIN_PASSWORD?.trim() || process.env.CORTIFREE_ADMIN_TOKEN?.trim() || "";
}

export function adminAuthConfigured() {
  return Boolean(adminPassword());
}

export function isAdminRequest(request: Request) {
  const expectedPassword = adminPassword();
  if (!expectedPassword) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    return constantTimeEqual(authorization.slice(7), expectedPassword);
  }
  if (!authorization.startsWith("Basic ")) return false;

  const credentials = decodeBasic(authorization.slice(6));
  if (!credentials) return false;
  const expectedUser = process.env.CORTIFREE_ADMIN_USER?.trim() || "admin";
  return constantTimeEqual(credentials.username, expectedUser)
    && constantTimeEqual(credentials.password, expectedPassword);
}

export function isCronRequest(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() || "";
  if (!expected) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return constantTimeEqual(bearer, expected)
    || constantTimeEqual(request.headers.get("x-cron-secret") ?? "", expected);
}

export function isCronOrAdminRequest(request: Request) {
  return isCronRequest(request) || isAdminRequest(request);
}

// Machine-to-machine routes that accept the CRON_SECRET bearer without a user session.
export const CRON_PATHS = new Set([
  "/api/autonomy/run",
  "/api/ops/refresh",
  "/api/sync/google",
  "/api/sync/persona-assets",
  "/api/acceptance/gate",
  "/api/production-gate",
]);

export function allowedEmails(raw = process.env.CORTIFREE_ALLOWED_EMAILS) {
  return (raw ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

// Fails closed in production: an empty allowlist admits nobody.
export function isEmailAllowed(email: string | null | undefined, allowlist = allowedEmails()) {
  if (!allowlist.length) return process.env.NODE_ENV !== "production";
  return Boolean(email && allowlist.includes(email.trim().toLowerCase()));
}
