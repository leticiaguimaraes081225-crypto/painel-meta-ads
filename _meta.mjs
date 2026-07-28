import crypto from "node:crypto";

const cookieName = "meta_ads_session";
const stateCookieName = "meta_ads_state";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`A variável ${name} não está configurada na Netlify.`);
  return value;
}

function key() {
  return crypto.createHash("sha256").update(required("TOKEN_ENCRYPTION_KEY")).digest();
}

export function secureCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  return Object.fromEntries(header.split(/;\s*/).filter(Boolean).map(part => {
    const i = part.indexOf("=");
    return [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

export function createState() { return crypto.randomBytes(24).toString("hex"); }
export const stateCookie = state => secureCookie(stateCookieName, state, 600);

export function validState(request, state) {
  const saved = parseCookies(request)[stateCookieName];
  return Boolean(saved && state && saved.length === state.length && crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(state)));
}

export function encryptSession(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSession(value) {
  try {
    const [iv, tag, data] = value.split(".").map(x => Buffer.from(x, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
  } catch { return null; }
}

export function sessionFromRequest(request) {
  const saved = parseCookies(request)[cookieName];
  return saved ? decryptSession(saved) : null;
}

export const sessionCookie = session => secureCookie(cookieName, encryptSession(session), 60 * 60 * 24 * 50);
export const clearSessionCookie = `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export const redirectUri = () => process.env.META_REDIRECT_URI || `${process.env.URL}/.netlify/functions/meta-callback`;
export const appId = () => required("META_APP_ID");
export const appSecret = () => required("META_APP_SECRET");
