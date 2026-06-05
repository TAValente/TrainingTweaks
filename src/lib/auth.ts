export const authCookieName = "trainingtweaks_session";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 180;
const textEncoder = new TextEncoder();

type SessionPayload = {
  exp: number;
  user: AuthenticatedUser;
  v: 2;
};

type ConfiguredUser = AuthenticatedUser & {
  password: string;
};

export type AuthenticatedUser = {
  email: string;
  id: string;
};

export function getSessionMaxAgeSeconds() {
  return sessionMaxAgeSeconds;
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function isPasswordConfigured() {
  return getConfiguredUsers().length > 0;
}

export function getLoginMode() {
  return "email-password";
}

export function authenticateConfiguredUser(email: string | undefined, password: string | undefined) {
  const normalizedEmail = normalizeEmail(email ?? "");
  if (!normalizedEmail || !password) return undefined;

  const users = getConfiguredUsers();
  const user = users.find((candidate) => candidate.email === normalizedEmail && candidate.password === password);

  if (!user) return undefined;
  return {
    email: user.email,
    id: user.id
  };
}

export async function createSessionCookieValue(secret: string, user: AuthenticatedUser) {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
    user,
    v: 2
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionCookie(value: string | undefined, secret: string) {
  return Boolean(await getSessionUserFromCookie(value, secret));
}

export async function getSessionUserFromCookie(value: string | undefined, secret: string) {
  if (!value || !secret) return false;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = await sign(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.v !== 2 || payload.exp <= Math.floor(Date.now() / 1000)) return false;
    if (!payload.user?.id || !payload.user.email) return false;
    return payload.user;
  } catch {
    return false;
  }
}

export async function getRequestUser(cookieValue: string | undefined) {
  return getSessionUserFromCookie(cookieValue, getAuthSecret());
}

function getConfiguredUsers(): ConfiguredUser[] {
  const usersJson = process.env.APP_USERS_JSON;
  if (usersJson) return parseUsersJson(usersJson);

  if (process.env.APP_USER_EMAIL && process.env.APP_PASSWORD) {
    const email = normalizeEmail(process.env.APP_USER_EMAIL);
    return [
      {
        email,
        id: process.env.APP_USER_ID?.trim() || email,
        password: process.env.APP_PASSWORD
      }
    ];
  }

  return [];
}

function parseUsersJson(value: string): ConfiguredUser[] {
  try {
    const parsed = JSON.parse(value) as Array<{ email?: string; id?: string; password?: string }>;
    return parsed
      .filter((user) => user.email && user.password)
      .map((user) => ({
        email: normalizeEmail(user.email ?? ""),
        id: user.id?.trim() || normalizeEmail(user.email ?? ""),
        password: user.password ?? ""
      }));
  } catch {
    return [];
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
