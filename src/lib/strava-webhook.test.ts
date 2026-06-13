import assert from "node:assert/strict";
import test from "node:test";
import {
  stravaWebhookEventCounts,
  stravaWebhookEventFromPayload,
  stravaWebhookIntakeContract,
  upsertStravaWebhookEvent,
  verifyStravaWebhookChallenge
} from "./strava-webhook.ts";

test("valid webhook GET challenge returns challenge JSON data", () => {
  const result = verifyStravaWebhookChallenge(
    new URLSearchParams({
      "hub.challenge": "challenge-value",
      "hub.verify_token": "known-token"
    }),
    "known-token"
  );

  assert.deepEqual(result, { ok: true, challenge: "challenge-value" });
});

test("invalid webhook verify token is rejected", () => {
  const result = verifyStravaWebhookChallenge(
    new URLSearchParams({
      "hub.challenge": "challenge-value",
      "hub.verify_token": "wrong-token"
    }),
    "known-token"
  );

  assert.deepEqual(result, {
    ok: false,
    error: "Invalid Strava webhook verify token.",
    status: 403
  });
});

test("valid POST payload stores pending activity create event", () => {
  const parsed = stravaWebhookEventFromPayload(activityPayload("create"), {
    id: "event-1",
    receivedAt: "2026-06-13T12:00:00.000Z"
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const stored = upsertStravaWebhookEvent([], parsed.event);

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.status, "pending");
  assert.equal(stored[0]?.eventKind, "activity_sync");
  assert.deepEqual(stravaWebhookEventCounts(stored), {
    receivedCount: 1,
    pendingCount: 1,
    failedCount: 0
  });
});

test("activity delete event is stored as delete job", () => {
  const parsed = stravaWebhookEventFromPayload(activityPayload("delete"), { id: "event-delete" });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.event.status, "pending");
  assert.equal(parsed.event.eventKind, "activity_delete");
});

test("athlete deauthorization event is marked clearly", () => {
  const parsed = stravaWebhookEventFromPayload({
    object_type: "athlete",
    object_id: 999,
    aspect_type: "update",
    owner_id: 999,
    event_time: 1771000000,
    subscription_id: 42,
    updates: { authorized: "false" }
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.event.status, "pending");
  assert.equal(parsed.event.eventKind, "athlete_deauthorization");
});

test("malformed payload is rejected safely", () => {
  const parsed = stravaWebhookEventFromPayload({
    object_type: "activity",
    aspect_type: "create"
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.error, /missing object_id/);
});

test("webhook intake contract does not perform heavy Strava work", () => {
  assert.deepEqual(stravaWebhookIntakeContract(), {
    fetchActivityDetails: false,
    fetchActivityStreams: false,
    computeRisk: false,
    runLlm: false
  });
});

test("duplicate webhook events are deduplicated by object aspect and event time", () => {
  const parsed = stravaWebhookEventFromPayload(activityPayload("create"), { id: "event-1" });
  const duplicate = stravaWebhookEventFromPayload(activityPayload("create"), { id: "event-2" });
  assert.equal(parsed.ok, true);
  assert.equal(duplicate.ok, true);
  if (!parsed.ok || !duplicate.ok) return;

  const stored = upsertStravaWebhookEvent(upsertStravaWebhookEvent([], parsed.event), duplicate.event);

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.id, "event-1");
});

function activityPayload(aspectType: "create" | "update" | "delete") {
  return {
    object_type: "activity",
    object_id: 123,
    aspect_type: aspectType,
    owner_id: 456,
    event_time: 1771000000,
    subscription_id: 42,
    updates: aspectType === "update" ? { title: "Morning Run" } : {}
  };
}
