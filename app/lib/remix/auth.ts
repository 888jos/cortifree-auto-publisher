export function assertRemixAuth(request: Request) {
  const expected = process.env.REMIX_API_TOKEN;
  if (!expected) throw new Error("REMIX_API_TOKEN is not configured");
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-remix-token");
  if (!supplied || supplied !== expected) throw new Error("Unauthorized remix request");
}
