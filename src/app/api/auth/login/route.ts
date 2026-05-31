import { NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  createSessionCookieValue,
  getAuthSecret,
  getSessionMaxAgeSeconds,
  isPasswordConfigured
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret || !isPasswordConfigured()) {
    return NextResponse.json(
      { error: "Login is not configured. Set APP_PASSWORD and AUTH_SECRET." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (body.password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, await createSessionCookieValue(secret), {
    httpOnly: true,
    maxAge: getSessionMaxAgeSeconds(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
