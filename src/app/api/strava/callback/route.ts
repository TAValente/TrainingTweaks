import { NextRequest, NextResponse } from "next/server";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/strava";
import { saveStravaTokens } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
  if (!user) return redirectWithStravaError(request, "Login required.");

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?strava=denied&reason=${error}`, request.url));
  }

  if (!code) {
    return redirectWithStravaError(request, "Missing Strava authorization code.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveStravaTokens(user.id, tokens);
  } catch (error) {
    return redirectWithStravaError(request, stravaCallbackErrorMessage(error));
  }

  return NextResponse.redirect(new URL("/?strava=connected", request.url));
}

function redirectWithStravaError(request: NextRequest, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("strava", "error");
  url.searchParams.set("reason", message);
  return NextResponse.redirect(url);
}

function stravaCallbackErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Strava connection failed.";
  if (message.includes("STRAVA_CLIENT_SECRET")) {
    return "Missing STRAVA_CLIENT_SECRET in the deployed environment.";
  }
  if (message.includes("STRAVA_CLIENT_ID")) {
    return "Missing STRAVA_CLIENT_ID in the deployed environment.";
  }
  if (message.includes("DATABASE_URL") || message.toLowerCase().includes("postgres")) {
    return "Could not save Strava tokens. Check DATABASE_URL in the deployed environment.";
  }
  if (message.includes("Strava token exchange failed")) {
    return "Strava token exchange failed. Check STRAVA_CLIENT_SECRET and the Strava callback domain.";
  }
  return "Strava connection failed. Check deployed environment variables and callback domain.";
}
