import { exchangeGoogleOAuthCode, googleOAuthRedirectUri, OAUTH_STATE_COOKIE, verifyOAuthState } from "../../../../lib/google/auth";
import { storeGoogleRefreshToken } from "../../../../lib/google/oauth-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const cookieNonce = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([name]) => name === OAUTH_STATE_COOKIE)?.[1];
  let validState = false;
  try { validState = verifyOAuthState(state, cookieNonce); } catch { validState = false; }
  if (!code || !validState) return new Response("OAuth state or code is invalid/expired.", { status: 400 });
  try {
    const token = await exchangeGoogleOAuthCode(code, url.origin);
    const refreshToken = token.refresh_token;
    if (!refreshToken) return new Response("Google did not return a refresh token. Revoke the existing CortiFree Drive permission and retry with consent.", { status: 400 });
    await storeGoogleRefreshToken(refreshToken);
    return new Response(`OAuth Google réussi. Le refresh token a été stocké chiffré côté backend.\n\nRedirect URI utilisée : ${googleOAuthRedirectUri(url.origin)}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 502 });
  }
}
