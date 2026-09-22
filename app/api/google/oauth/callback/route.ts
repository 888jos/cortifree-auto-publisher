import { exchangeGoogleOAuthCode, googleOAuthRedirectUri, verifyOAuthState } from "../../../../lib/google/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code || !verifyOAuthState(state)) return new Response("OAuth state or code is invalid/expired.", { status: 400 });
  try {
    const token = await exchangeGoogleOAuthCode(code, url.origin);
    const refreshToken = token.refresh_token;
    if (!refreshToken) return new Response("Google did not return a refresh token. Revoke the existing CortiFree Drive permission and retry with consent.", { status: 400 });
    return new Response(`OAuth Google réussi. Ajoute ce refresh token dans Vercel comme GOOGLE_OAUTH_REFRESH_TOKEN, puis redéploie.\n\n${refreshToken}\n\nRedirect URI utilisée : ${googleOAuthRedirectUri(url.origin)}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 502 });
  }
}
