import { NextRequest, NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import {
  authorizeManualStravaWebhookProcess,
  parseStravaWebhookProcessLimit,
  stravaWebhookProcessSecretHeader,
  stravaWebhookProcessUnauthorizedError
} from "@/lib/strava-webhook-process-route";
import {
  processPendingStravaWebhookEvents
} from "@/lib/strava-webhook-processor";
import { getStravaWebhookProcessorMetadata } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expectedSecret = getOptionalEnv("STRAVA_WEBHOOK_PROCESS_SECRET");
  const providedSecret = request.headers.get(stravaWebhookProcessSecretHeader);

  if (!authorizeManualStravaWebhookProcess({ providedSecret, expectedSecret })) {
    return NextResponse.json({ error: stravaWebhookProcessUnauthorizedError }, { status: 401 });
  }

  const limit = parseStravaWebhookProcessLimit(request.nextUrl.searchParams.get("limit"));
  const summary = await processPendingStravaWebhookEvents({ limit, source: "manual" });
  return NextResponse.json({ ok: true, source: "manual", ...summary });
}

export async function GET(request: NextRequest) {
  const expectedSecret = getOptionalEnv("STRAVA_WEBHOOK_PROCESS_SECRET");
  const providedSecret = request.headers.get(stravaWebhookProcessSecretHeader);

  if (!authorizeManualStravaWebhookProcess({ providedSecret, expectedSecret })) {
    return NextResponse.json({ error: stravaWebhookProcessUnauthorizedError }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...(await getStravaWebhookProcessorMetadata()) });
}
