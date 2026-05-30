import { NextResponse } from "next/server";
import { getStravaAuthorizationUrl } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.redirect(getStravaAuthorizationUrl());
}
