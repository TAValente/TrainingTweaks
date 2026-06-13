import { NextRequest, NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import {
  authorizeCronStravaWebhookProcess,
  parseStravaWebhookProcessLimit,
  stravaWebhookProcessSecretHeader
} from "@/lib/strava-webhook-process-route";
import { processPendingStravaWebhookEvents } from "@/lib/strava-webhook-processor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expectedSecret = getOptionalEnv("STRAVA_WEBHOOK_PROCESS_SECRET");
  const providedSecret =
    request.headers.get(stravaWebhookProcessSecretHeader) ??
    request.nextUrl.searchParams.get("secret");
  const authorized = authorizeCronStravaWebhookProcess({
    userAgent: request.headers.get("user-agent"),
    providedSecret,
    expectedSecret
  });

  if (!authorized) {
    return NextResponse.json({ error: "Invalid Strava webhook cron trigger." }, { status: 401 });
  }

  const limit = parseStravaWebhookProcessLimit(request.nextUrl.searchParams.get("limit"));
  const summary = await processPendingStravaWebhookEvents({ limit, source: "cron" });
  return NextResponse.json({ ok: true, source: "cron", ...summary });
}
