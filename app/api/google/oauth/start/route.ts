import { googleOAuthAuthorizationUrl, googleUserOAuthConfigured, OAUTH_STATE_COOKIE, signedOAuthState } from "../../../../lib/google/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!googleUserOAuthConfigured() && !process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return Response.json({ error: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first" }, { status: 503 });
  }
  const url = new URL(request.url);
  const nonce = crypto.randomUUID();
  let location: string;
  try {
    location = googleOAuthAuthorizationUrl(signedOAuthState(nonce), url.origin);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": `${OAUTH_STATE_COOKIE}=${nonce}; Path=/api/google/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
