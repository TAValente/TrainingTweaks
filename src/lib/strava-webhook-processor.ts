import { fetchStravaActivityById, refreshTokensIfNeeded } from "./strava.ts";
import {
  countPendingStravaWebhookEvents,
  disconnectStravaTokens,
  findUserIdByStravaAthleteId,
  getData,
  listPendingStravaWebhookEvents,
  recordStravaWebhookProcessorRun,
  removeStravaActivity,
  saveActivities,
  saveStravaTokens,
  updateStravaWebhookEventStatus
} from "./store.ts";
import type { Activity, StravaTokenSet, StravaWebhookEvent, StravaWebhookEventStatus } from "./types.ts";

export type StravaWebhookProcessingSummary = {
  processedCount: number;
  failedCount: number;
  ignoredCount: number;
  attemptedCount: number;
  remainingPendingCount: number;
  events: Array<{
    eventId: string;
    eventKind: StravaWebhookEvent["eventKind"];
    status: StravaWebhookEventStatus;
    matchedUserId?: string;
    reason?: string;
  }>;
};

export type StravaWebhookProcessorOptions = {
  limit?: number;
  source?: "manual";
  now?: Date;
  fetchTimeoutMs?: number;
  deps?: Partial<StravaWebhookProcessorDependencies>;
};

export function isStravaWebhookProcessAuthorized(
  providedSecret: string | undefined | null,
  expectedSecret: string | undefined
) {
  return Boolean(expectedSecret && providedSecret === expectedSecret);
}

type StravaWebhookProcessorDependencies = {
  listPendingEvents: (limit: number) => Promise<StravaWebhookEvent[]>;
  countPendingEvents: typeof countPendingStravaWebhookEvents;
  recordProcessorRun: typeof recordStravaWebhookProcessorRun;
  updateEventStatus: typeof updateStravaWebhookEventStatus;
  findUserIdByStravaAthleteId: typeof findUserIdByStravaAthleteId;
  getData: typeof getData;
  refreshTokensIfNeeded: typeof refreshTokensIfNeeded;
  saveStravaTokens: typeof saveStravaTokens;
  fetchStravaActivityById: typeof fetchStravaActivityById;
  saveActivities: typeof saveActivities;
  removeStravaActivity: typeof removeStravaActivity;
  disconnectStravaTokens: typeof disconnectStravaTokens;
};

const defaultLimit = 25;

export async function processPendingStravaWebhookEvents(
  options: StravaWebhookProcessorOptions = {}
): Promise<StravaWebhookProcessingSummary> {
  const limit = positiveInteger(options.limit, defaultLimit);
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const deps = {
    listPendingEvents: listPendingStravaWebhookEvents,
    countPendingEvents: countPendingStravaWebhookEvents,
    recordProcessorRun: recordStravaWebhookProcessorRun,
    updateEventStatus: updateStravaWebhookEventStatus,
    findUserIdByStravaAthleteId,
    getData,
    refreshTokensIfNeeded,
    saveStravaTokens,
    fetchStravaActivityById,
    saveActivities,
    removeStravaActivity,
    disconnectStravaTokens,
    ...options.deps
  } satisfies StravaWebhookProcessorDependencies;
  const pendingEvents = await deps.listPendingEvents(limit);
  const summary: StravaWebhookProcessingSummary = {
    processedCount: 0,
    failedCount: 0,
    ignoredCount: 0,
    attemptedCount: 0,
    remainingPendingCount: 0,
    events: []
  };

  for (const event of pendingEvents) {
    summary.attemptedCount += 1;
    const attempts = event.attempts + 1;
    await deps.updateEventStatus(event.id, "pending", {
      attempts,
      lastAttemptAt: timestamp
    });

    try {
      const result = await processStravaWebhookEvent(event, {
        deps,
        timestamp,
        fetchTimeoutMs: options.fetchTimeoutMs
      });
      if (result.status === "processed") summary.processedCount += 1;
      if (result.status === "ignored") summary.ignoredCount += 1;
      if (result.status === "failed") summary.failedCount += 1;
      summary.events.push(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown Strava webhook processing error.";
      await deps.updateEventStatus(event.id, "failed", {
        attempts,
        lastAttemptAt: timestamp,
        failedAt: timestamp,
        failureReason: reason
      });
      summary.failedCount += 1;
      summary.events.push({
        eventId: event.id,
        eventKind: event.eventKind,
        status: "failed",
        reason
      });
    }
  }

  summary.remainingPendingCount = await deps.countPendingEvents();
  await deps.recordProcessorRun(timestamp, {
    source: options.source,
    attemptedCount: summary.attemptedCount,
    processedCount: summary.processedCount,
    failedCount: summary.failedCount,
    ignoredCount: summary.ignoredCount,
    remainingPendingCount: summary.remainingPendingCount
  });

  return summary;
}

async function processStravaWebhookEvent(
  event: StravaWebhookEvent,
  context: {
    deps: StravaWebhookProcessorDependencies;
    timestamp: string;
    fetchTimeoutMs?: number;
  }
): Promise<StravaWebhookProcessingSummary["events"][number]> {
  if (event.eventKind === "unknown") {
    return ignoreEvent(event, context, "Unsupported Strava webhook event kind.");
  }

  const userId = await context.deps.findUserIdByStravaAthleteId(event.ownerId);
  if (!userId) {
    return failEvent(event, context, `No app user found for Strava athlete ${event.ownerId}.`);
  }

  if (event.eventKind === "activity_delete") {
    await context.deps.removeStravaActivity(userId, String(event.objectId));
    return processEvent(event, context, userId);
  }

  if (event.eventKind === "athlete_deauthorization") {
    await context.deps.disconnectStravaTokens(userId);
    return processEvent(event, context, userId);
  }

  if (event.eventKind === "activity_sync") {
    const data = await context.deps.getData(userId);
    if (!data.strava) {
      return failEvent(event, context, `Matched user ${userId} has no stored Strava token.`);
    }

    const tokens = await context.deps.refreshTokensIfNeeded(data.strava, { timeoutMs: context.fetchTimeoutMs });
    if (tokensChanged(data.strava, tokens)) {
      await context.deps.saveStravaTokens(userId, tokens);
    }

    const activity = await context.deps.fetchStravaActivityById(tokens.accessToken, event.objectId, {
      timeoutMs: context.fetchTimeoutMs
    });
    await context.deps.saveActivities(userId, [activity]);
    return processEvent(event, context, userId);
  }

  return ignoreEvent(event, context, "Unsupported Strava webhook event kind.");
}

async function processEvent(
  event: StravaWebhookEvent,
  context: { deps: StravaWebhookProcessorDependencies; timestamp: string },
  userId: string
) {
  await context.deps.updateEventStatus(event.id, "processed", {
    processedAt: context.timestamp,
    matchedUserId: userId,
    failureReason: undefined,
    ignoredReason: undefined
  });
  return {
    eventId: event.id,
    eventKind: event.eventKind,
    status: "processed" as const,
    matchedUserId: userId
  };
}

async function failEvent(
  event: StravaWebhookEvent,
  context: { deps: StravaWebhookProcessorDependencies; timestamp: string },
  reason: string
) {
  await context.deps.updateEventStatus(event.id, "failed", {
    failedAt: context.timestamp,
    failureReason: reason
  });
  return {
    eventId: event.id,
    eventKind: event.eventKind,
    status: "failed" as const,
    reason
  };
}

async function ignoreEvent(
  event: StravaWebhookEvent,
  context: { deps: StravaWebhookProcessorDependencies; timestamp: string },
  reason: string
) {
  await context.deps.updateEventStatus(event.id, "ignored", {
    ignoredAt: context.timestamp,
    ignoredReason: reason
  });
  return {
    eventId: event.id,
    eventKind: event.eventKind,
    status: "ignored" as const,
    reason
  };
}

function tokensChanged(left: StravaTokenSet, right: StravaTokenSet) {
  return (
    left.accessToken !== right.accessToken ||
    left.refreshToken !== right.refreshToken ||
    left.expiresAt !== right.expiresAt ||
    left.athleteId !== right.athleteId
  );
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
