import { randomUUID } from "node:crypto";
import type { StravaWebhookEvent, StravaWebhookEventKind } from "./types.ts";

export type StravaWebhookChallengeResult =
  | { ok: true; challenge: string }
  | { ok: false; error: string; status: 400 | 403 };

export type StravaWebhookIntakeContract = {
  fetchActivityDetails: false;
  fetchActivityStreams: false;
  computeRisk: false;
  runLlm: false;
};

export function verifyStravaWebhookChallenge(
  params: URLSearchParams,
  expectedVerifyToken: string | undefined
): StravaWebhookChallengeResult {
  const challenge = params.get("hub.challenge");
  const verifyToken = params.get("hub.verify_token");
  if (!challenge) return { ok: false, error: "Missing Strava webhook challenge.", status: 400 };
  if (!expectedVerifyToken || verifyToken !== expectedVerifyToken) {
    return { ok: false, error: "Invalid Strava webhook verify token.", status: 403 };
  }
  return { ok: true, challenge };
}

export function stravaWebhookEventFromPayload(
  payload: unknown,
  options: { id?: string; receivedAt?: string } = {}
): { ok: true; event: StravaWebhookEvent } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Strava webhook payload must be an object." };
  }
  const body = payload as Record<string, unknown>;
  const objectType = stringField(body, "object_type");
  const aspectType = stringField(body, "aspect_type");
  const objectId = numberField(body, "object_id");
  const ownerId = numberField(body, "owner_id");
  const eventTime = numberField(body, "event_time");
  const subscriptionId = numberField(body, "subscription_id");
  const updates = objectField(body, "updates");
  const missing = [
    ["object_type", objectType],
    ["object_id", objectId],
    ["aspect_type", aspectType],
    ["owner_id", ownerId],
    ["event_time", eventTime],
    ["subscription_id", subscriptionId],
    ["updates", updates]
  ].filter(([, value]) => value === undefined);

  if (missing.length) {
    return {
      ok: false,
      error: `Malformed Strava webhook payload: missing ${missing.map(([field]) => field).join(", ")}.`
    };
  }
  if (
    objectType === undefined ||
    objectId === undefined ||
    aspectType === undefined ||
    ownerId === undefined ||
    eventTime === undefined ||
    subscriptionId === undefined ||
    updates === undefined
  ) {
    return { ok: false, error: "Malformed Strava webhook payload." };
  }

  const eventKind = classifyWebhookEvent(objectType, aspectType, updates);
  return {
    ok: true,
    event: {
      id: options.id ?? randomUUID(),
      provider: "strava",
      objectType,
      objectId,
      aspectType,
      ownerId,
      subscriptionId,
      eventTime,
      updates,
      receivedAt: options.receivedAt ?? new Date().toISOString(),
      status: eventKind === "unknown" ? "ignored" : "pending",
      attempts: 0,
      eventKind
    }
  };
}

export function upsertStravaWebhookEvent(events: StravaWebhookEvent[], event: StravaWebhookEvent) {
  if (events.some((candidate) => stravaWebhookDedupKey(candidate) === stravaWebhookDedupKey(event))) {
    return events;
  }
  return [...events, event];
}

export function stravaWebhookEventCounts(events: StravaWebhookEvent[]) {
  return {
    receivedCount: events.length,
    pendingCount: events.filter((event) => event.status === "pending").length,
    failedCount: events.filter((event) => event.status === "failed").length
  };
}

export function stravaWebhookIntakeContract(): StravaWebhookIntakeContract {
  return {
    fetchActivityDetails: false,
    fetchActivityStreams: false,
    computeRisk: false,
    runLlm: false
  };
}

function classifyWebhookEvent(
  objectType: string,
  aspectType: string,
  updates: Record<string, unknown>
): StravaWebhookEventKind {
  if (objectType === "athlete" && updates.authorized === "false") return "athlete_deauthorization";
  if (objectType === "activity" && aspectType === "delete") return "activity_delete";
  if (objectType === "activity" && (aspectType === "create" || aspectType === "update")) return "activity_sync";
  return "unknown";
}

function stravaWebhookDedupKey(event: StravaWebhookEvent) {
  return `${event.provider}:${event.objectType}:${event.objectId}:${event.aspectType}:${event.eventTime}`;
}

function stringField(body: Record<string, unknown>, field: string) {
  const value = body[field];
  return typeof value === "string" && value ? value : undefined;
}

function numberField(body: Record<string, unknown>, field: string) {
  const value = body[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectField(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
