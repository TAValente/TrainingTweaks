import assert from "node:assert/strict";
import test from "node:test";
import {
  isStravaWebhookProcessAuthorized,
  processPendingStravaWebhookEvents
} from "./strava-webhook-processor.ts";
import type { Activity, AppData, StravaTokenSet, StravaWebhookEvent, StravaWebhookEventStatus } from "./types.ts";

test("activity sync maps owner_id to matching user by strava athlete id and saves fetched activity", async () => {
  const event = webhookEvent({ id: "event-sync", ownerId: 456, objectId: 123, eventKind: "activity_sync" });
  const harness = processorHarness({
    events: [event],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 111 }) },
      "user-b": { activities: [], strava: tokens({ athleteId: 456 }) }
    }
  });

  const summary = await processPendingStravaWebhookEvents({
    now: new Date("2026-06-13T12:00:00.000Z"),
    deps: harness.deps
  });

  assert.equal(summary.processedCount, 1);
  assert.deepEqual(harness.fetchedActivityIds, [123]);
  assert.equal(harness.users["user-b"]?.activities[0]?.providerActivityId, "123");
  assert.equal(harness.events[0]?.status, "processed");
  assert.equal(harness.events[0]?.matchedUserId, "user-b");
});

test("no matching user marks event failed with clear reason", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ ownerId: 999, eventKind: "activity_sync" })],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 456 }) }
    }
  });

  const summary = await processPendingStravaWebhookEvents({ deps: harness.deps });

  assert.equal(summary.failedCount, 1);
  assert.equal(harness.events[0]?.status, "failed");
  assert.match(harness.events[0]?.failureReason ?? "", /No app user found for Strava athlete 999/);
});

test("activity sync fetches exactly one activity by object_id", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ objectId: 987, ownerId: 456, eventKind: "activity_sync" })],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 456 }) }
    }
  });

  await processPendingStravaWebhookEvents({ deps: harness.deps });

  assert.deepEqual(harness.fetchedActivityIds, [987]);
});

test("activity delete removes the correct stored activity", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ objectId: 2, ownerId: 456, eventKind: "activity_delete" })],
    users: {
      "user-a": {
        activities: [activity("1"), activity("2"), activity("3")],
        strava: tokens({ athleteId: 456 })
      }
    }
  });

  await processPendingStravaWebhookEvents({ deps: harness.deps });

  assert.deepEqual(harness.users["user-a"]?.activities.map((candidate) => candidate.providerActivityId), ["1", "3"]);
  assert.equal(harness.events[0]?.status, "processed");
});

test("athlete deauthorization disconnects tokens and marks event processed", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ ownerId: 456, objectId: 456, eventKind: "athlete_deauthorization" })],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 456 }) }
    }
  });

  await processPendingStravaWebhookEvents({ deps: harness.deps });

  assert.equal(harness.users["user-a"]?.strava, undefined);
  assert.equal(harness.events[0]?.status, "processed");
});

test("unknown pending event is ignored without crashing", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ eventKind: "unknown" })],
    users: {}
  });

  const summary = await processPendingStravaWebhookEvents({ deps: harness.deps });

  assert.equal(summary.ignoredCount, 1);
  assert.equal(harness.events[0]?.status, "ignored");
  assert.match(harness.events[0]?.ignoredReason ?? "", /Unsupported/);
});

test("processor respects processing limit", async () => {
  const harness = processorHarness({
    events: [
      webhookEvent({ id: "event-1", objectId: 1 }),
      webhookEvent({ id: "event-2", objectId: 2 }),
      webhookEvent({ id: "event-3", objectId: 3 })
    ],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 456 }) }
    }
  });

  const summary = await processPendingStravaWebhookEvents({ limit: 2, deps: harness.deps });

  assert.equal(harness.requestedLimit, 2);
  assert.equal(summary.attemptedCount, 2);
  assert.equal(harness.events[0]?.status, "processed");
  assert.equal(harness.events[1]?.status, "processed");
  assert.equal(harness.events[2]?.status, "pending");
});

test("processor increments attempts and records failure reason on fetch failure", async () => {
  const harness = processorHarness({
    events: [webhookEvent({ attempts: 2, ownerId: 456, eventKind: "activity_sync" })],
    users: {
      "user-a": { activities: [], strava: tokens({ athleteId: 456 }) }
    },
    fetchError: new Error("Strava is unavailable")
  });

  const summary = await processPendingStravaWebhookEvents({
    now: new Date("2026-06-13T12:00:00.000Z"),
    deps: harness.deps
  });

  assert.equal(summary.failedCount, 1);
  assert.equal(harness.events[0]?.attempts, 3);
  assert.equal(harness.events[0]?.lastAttemptAt, "2026-06-13T12:00:00.000Z");
  assert.equal(harness.events[0]?.failedAt, "2026-06-13T12:00:00.000Z");
  assert.match(harness.events[0]?.failureReason ?? "", /Strava is unavailable/);
});

test("webhook processor route authorization requires configured matching secret", () => {
  assert.equal(isStravaWebhookProcessAuthorized(undefined, "process-secret"), false);
  assert.equal(isStravaWebhookProcessAuthorized("wrong", "process-secret"), false);
  assert.equal(isStravaWebhookProcessAuthorized("process-secret", undefined), false);
  assert.equal(isStravaWebhookProcessAuthorized("process-secret", "process-secret"), true);
});

function processorHarness(input: {
  events: StravaWebhookEvent[];
  users: Record<string, AppData>;
  fetchError?: Error;
}) {
  const events = input.events.map((event) => ({ ...event }));
  const users: Record<string, AppData> = Object.fromEntries(
    Object.entries(input.users).map(([userId, data]) => [
      userId,
      { ...data, activities: [...data.activities] }
    ])
  );
  const fetchedActivityIds: Array<number | string> = [];
  let requestedLimit = 0;

  return {
    events,
    users,
    fetchedActivityIds,
    get requestedLimit() {
      return requestedLimit;
    },
    deps: {
      listPendingEvents: async (limit: number) => {
        requestedLimit = limit;
        return events.filter((event) => event.status === "pending").slice(0, limit);
      },
      updateEventStatus: async (
        eventId: string,
        status: StravaWebhookEventStatus,
        metadata: Partial<StravaWebhookEvent> = {}
      ) => {
        const index = events.findIndex((event) => event.id === eventId);
        assert.notEqual(index, -1);
        events[index] = { ...events[index]!, status, ...metadata };
        return events[index];
      },
      findUserIdByStravaAthleteId: async (athleteId: number) =>
        Object.entries(users).find(([, data]) => data.strava?.athleteId === athleteId)?.[0],
      getData: async (userId: string) => users[userId] ?? { activities: [] },
      refreshTokensIfNeeded: async (tokenSet: StravaTokenSet) => tokenSet,
      saveStravaTokens: async (userId: string, tokenSet: StravaTokenSet) => {
        users[userId] = { ...(users[userId] ?? { activities: [] }), strava: tokenSet };
      },
      fetchStravaActivityById: async (_accessToken: string, activityId: number | string) => {
        fetchedActivityIds.push(activityId);
        if (input.fetchError) throw input.fetchError;
        return activity(String(activityId));
      },
      saveActivities: async (userId: string, activities: Activity[]) => {
        const data = users[userId] ?? { activities: [] };
        const byId = new Map(data.activities.map((candidate) => [candidate.providerActivityId, candidate]));
        for (const next of activities) byId.set(next.providerActivityId, next);
        users[userId] = { ...data, activities: Array.from(byId.values()) };
        return users[userId]!.activities;
      },
      removeStravaActivity: async (userId: string, providerActivityId: string) => {
        const data = users[userId] ?? { activities: [] };
        users[userId] = {
          ...data,
          activities: data.activities.filter((candidate) => candidate.providerActivityId !== providerActivityId)
        };
        return users[userId]!.activities;
      },
      disconnectStravaTokens: async (userId: string) => {
        const data = users[userId] ?? { activities: [] };
        const { strava: _strava, ...nextData } = data;
        users[userId] = nextData;
      }
    }
  };
}

function webhookEvent(overrides: Partial<StravaWebhookEvent> = {}): StravaWebhookEvent {
  return {
    id: "event-1",
    provider: "strava",
    objectType: "activity",
    objectId: 123,
    aspectType: "create",
    ownerId: 456,
    subscriptionId: 42,
    eventTime: 1771000000,
    updates: {},
    receivedAt: "2026-06-13T11:00:00.000Z",
    status: "pending",
    attempts: 0,
    eventKind: "activity_sync",
    ...overrides
  };
}

function tokens(overrides: Partial<StravaTokenSet> = {}): StravaTokenSet {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 1771000000,
    ...overrides
  };
}

function activity(id: string): Activity {
  return {
    provider: "strava",
    providerActivityId: id,
    startDate: "2026-06-13T12:00:00Z",
    sportType: "Run",
    name: `Run ${id}`,
    distanceMeters: 1609.344,
    movingTimeSeconds: 600
  };
}
