import { appId, createState, redirectUri, stateCookie } from "./_meta.mjs";

export default async () => {
  try {
    const state = createState();
    const params = new URLSearchParams({
      client_id: appId(),
      redirect_uri: redirectUri(),
      state,
      response_type: "code",
      scope: "ads_read",
    });
    return new Response(null, { status: 302, headers: { Location: `https://www.facebook.com/v24.0/dialog/oauth?${params}`, "Set-Cookie": stateCookie(state) } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
