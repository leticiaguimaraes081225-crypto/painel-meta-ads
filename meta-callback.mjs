import { appId, appSecret, redirectUri, sessionCookie, validState } from "./_meta.mjs";

export default async request => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const home = new URL("/", url.origin);
  if (error) { home.searchParams.set("meta", "cancelado"); return Response.redirect(home, 302); }
  if (!code || !validState(request, state)) { home.searchParams.set("meta", "erro"); return Response.redirect(home, 302); }
  try {
    const params = new URLSearchParams({ client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri(), code });
    const result = await fetch(`https://graph.facebook.com/v24.0/oauth/access_token?${params}`);
    const data = await result.json();
    if (!result.ok || !data.access_token) throw new Error(data.error?.message || "Não foi possível autorizar a Meta.");
    home.searchParams.set("meta", "conectado");
    return new Response(null, { status: 302, headers: { Location: home.toString(), "Set-Cookie": sessionCookie({ accessToken: data.access_token, connectedAt: Date.now() }) } });
  } catch (err) {
    home.searchParams.set("meta", "erro");
    return new Response(null, { status: 302, headers: { Location: home.toString() } });
  }
};
