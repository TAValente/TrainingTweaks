import { NextRequest, NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import {
  stravaWebhookEventFromPayload,
  verifyStravaWebhookChallenge
} from "@/lib/strava-webhook";
import { appendStravaWebhookEvent } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const verification = verifyStravaWebhookChallenge(
    request.nextUrl.searchParams,
    getOptionalEnv("STRAVA_WEBHOOK_VERIFY_TOKEN")
  );

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  return NextResponse.json({ "hub.challenge": verification.challenge });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Strava webhook payload must be valid JSON." }, { status: 400 });
  }

  const parsed = stravaWebhookEventFromPayload(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const stored = await appendStravaWebhookEvent(parsed.event);
  return NextResponse.json({
    ok: true,
    eventId: parsed.event.id,
    duplicate: stored.duplicate,
    status: parsed.event.status,
    eventKind: parsed.event.eventKind,
    counts: stored.counts
  });
}
