import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/strava";
import { saveStravaTokens } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?strava=denied&reason=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.json({ error: "Missing Strava authorization code." }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(code);
  await saveStravaTokens(tokens);

  return NextResponse.redirect(new URL("/?strava=connected", request.url));
}
