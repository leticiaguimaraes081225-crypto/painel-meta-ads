import { clearSessionCookie } from "./_meta.mjs";
export default async () => new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": clearSessionCookie } });
