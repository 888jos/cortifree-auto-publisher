import { googleOAuthAuthorizationUrl, googleUserOAuthConfigured, signedOAuthState } from "../../../../lib/google/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!googleUserOAuthConfigured() && !process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return Response.json({ error: "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first" }, { status: 503 });
  }
  const url = new URL(request.url);
  return Response.redirect(googleOAuthAuthorizationUrl(signedOAuthState(), url.origin));
}
