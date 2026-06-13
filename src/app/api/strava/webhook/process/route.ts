import { NextRequest, NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import {
  isStravaWebhookProcessAuthorized,
  processPendingStravaWebhookEvents
} from "@/lib/strava-webhook-processor";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expectedSecret = getOptionalEnv("STRAVA_WEBHOOK_PROCESS_SECRET");
  const providedSecret = request.headers.get("x-trainingtweaks-process-secret");

  if (!isStravaWebhookProcessAuthorized(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Invalid Strava webhook process secret." }, { status: 401 });
  }

  const limit = limitFromRequest(request);
  const summary = await processPendingStravaWebhookEvents({ limit });
  return NextResponse.json({ ok: true, ...summary });
}

function limitFromRequest(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("limit");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}
