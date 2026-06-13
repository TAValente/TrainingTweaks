import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { getDatabasePoolConfig } from "./database.ts";
import { redactModelRun } from "./model-runs.ts";
import { stravaWebhookEventCounts, upsertStravaWebhookEvent } from "./strava-webhook.ts";
import type {
  AppData,
  Activity,
  ModelRunFeedback,
  StoredModelRun,
  StravaTokenSet,
  StravaWebhookEvent,
  StravaWebhookProcessorRun,
  StravaWebhookProcessorRunSummary,
  StravaWebhookEventStatus,
  TrainingContext
} from "./types.ts";

const maxStoredModelRuns = 100;
const maxStoredStravaWebhookEvents = 500;
const maxStoredStravaWebhookProcessorRuns = 25;
const stravaWebhookStoreId = "__strava_webhook_events__";
let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function emptyData(): AppData {
  return {
    activities: [],
    modelRuns: []
  };
}

function getPool() {
  const config = getDatabasePoolConfig();
  if (!config) return undefined;

  pool ??= new Pool(config);
  return pool;
}

async function ensureSchema() {
  const database = getPool();
  if (!database) return;

  schemaReady ??= database.query(`
    create table if not exists trainingtweaks_app_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `).then(() => undefined);

  await schemaReady;
}

async function readStore(userId: string): Promise<AppData> {
  const database = getPool();
  if (database) return readDatabaseStore(database, userId);
  return readFileStore(userId);
}

async function readDatabaseStore(database: Pool, userId: string): Promise<AppData> {
  await ensureSchema();
  const result = await database.query<{ data: AppData }>(
    "select data from trainingtweaks_app_state where id = $1",
    [appStateIdForUser(userId)]
  );
  const data = result.rows[0]?.data;
  return {
    ...emptyData(),
    ...data,
    activities: data?.activities ?? [],
    modelRuns: data?.modelRuns ?? [],
    stravaWebhookEvents: data?.stravaWebhookEvents ?? [],
    webhookProcessingRuns: data?.webhookProcessingRuns ?? []
  };
}

async function readFileStore(userId: string): Promise<AppData> {
  try {
    const raw = await readFile(storePathForUser(userId), "utf8");
    const parsed = JSON.parse(raw) as AppData;
    return {
      ...emptyData(),
      ...parsed,
      activities: parsed.activities ?? [],
      modelRuns: parsed.modelRuns ?? [],
      stravaWebhookEvents: parsed.stravaWebhookEvents ?? [],
      webhookProcessingRuns: parsed.webhookProcessingRuns ?? []
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyData();
    throw error;
  }
}

async function writeStore(userId: string, data: AppData) {
  const database = getPool();
  if (database) {
    await writeDatabaseStore(database, userId, data);
    return;
  }

  await writeFileStore(userId, data);
}

async function writeDatabaseStore(database: Pool, userId: string, data: AppData) {
  await ensureSchema();
  await database.query(
    `
      insert into trainingtweaks_app_state (id, data, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set data = excluded.data, updated_at = now()
    `,
    [appStateIdForUser(userId), JSON.stringify(data)]
  );
}

async function writeFileStore(userId: string, data: AppData) {
  const path = storePathForUser(userId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export async function getData(userId: string) {
  return readStore(userId);
}

export async function saveStravaTokens(userId: string, tokens: StravaTokenSet) {
  const data = await readStore(userId);
  await writeStore(userId, { ...data, strava: tokens });
}

export async function disconnectStravaTokens(userId: string) {
  const data = await readStore(userId);
  const { strava: _strava, ...nextData } = data;
  await writeStore(userId, nextData);
}

export async function saveActivities(userId: string, activities: Activity[]) {
  const data = await readStore(userId);
  const merged = new Map<string, Activity>();
  for (const activity of data.activities) {
    merged.set(`${activity.provider}:${activity.providerActivityId}`, activity);
  }
  for (const activity of activities) {
    const key = `${activity.provider}:${activity.providerActivityId}`;
    const existing = merged.get(key);
    merged.set(key, mergeActivity(existing, activity));
  }

  const sorted = Array.from(merged.values()).sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  await writeStore(userId, {
    ...data,
    activities: sorted,
    lastRefreshAt: new Date().toISOString()
  });
  return sorted;
}

export async function removeStravaActivity(userId: string, providerActivityId: string) {
  const data = await readStore(userId);
  const activities = data.activities.filter(
    (activity) => activity.provider !== "strava" || activity.providerActivityId !== providerActivityId
  );
  await writeStore(userId, {
    ...data,
    activities,
    lastRefreshAt: new Date().toISOString()
  });
  return activities;
}

export async function saveContext(userId: string, context: TrainingContext) {
  const data = await readStore(userId);
  await writeStore(userId, { ...data, context });
}

export async function appendModelRun(userId: string, modelRun: StoredModelRun) {
  const data = await readStore(userId);
  const modelRuns = [...(data.modelRuns ?? []), redactModelRun(modelRun)].slice(-maxStoredModelRuns);
  await writeStore(userId, { ...data, modelRuns });
}

export async function updateModelRunFeedback(userId: string, modelRunId: string, feedback: ModelRunFeedback) {
  const data = await readStore(userId);
  let updatedRun: StoredModelRun | undefined;
  const modelRuns = (data.modelRuns ?? []).map((modelRun) => {
    if (modelRun.id !== modelRunId) return modelRun;
    updatedRun = redactModelRun({ ...modelRun, feedback });
    return updatedRun;
  });

  if (!updatedRun) return undefined;
  await writeStore(userId, { ...data, modelRuns });

  const verificationData = await readStore(userId);
  const verifiedRun = verificationData.modelRuns?.find((modelRun) => modelRun.id === modelRunId);
  if (
    verifiedRun?.feedback?.rating !== feedback.rating ||
    verifiedRun.feedback.note !== feedback.note ||
    verifiedRun.feedback.updatedAt !== feedback.updatedAt
  ) {
    throw new Error("Model run feedback was not persisted.");
  }

  return verifiedRun;
}

export async function appendStravaWebhookEvent(event: StravaWebhookEvent) {
  const data = await readStore(stravaWebhookStoreId);
  const events = upsertStravaWebhookEvent(data.stravaWebhookEvents ?? [], event).slice(-maxStoredStravaWebhookEvents);
  await writeStore(stravaWebhookStoreId, { ...data, stravaWebhookEvents: events });
  return {
    event,
    counts: stravaWebhookEventCounts(events),
    duplicate: events.every((candidate) => candidate.id !== event.id)
  };
}

export async function listPendingStravaWebhookEvents(limit: number) {
  const data = await readStore(stravaWebhookStoreId);
  return (data.stravaWebhookEvents ?? [])
    .filter((event) => event.status === "pending")
    .slice(0, Math.max(0, Math.floor(limit)));
}

export async function countPendingStravaWebhookEvents() {
  const data = await readStore(stravaWebhookStoreId);
  return (data.stravaWebhookEvents ?? []).filter((event) => event.status === "pending").length;
}

export async function updateStravaWebhookEventStatus(
  eventId: string,
  status: StravaWebhookEventStatus,
  metadata: Partial<Pick<
    StravaWebhookEvent,
    | "processedAt"
    | "failedAt"
    | "ignoredAt"
    | "failureReason"
    | "ignoredReason"
    | "matchedUserId"
    | "lastAttemptAt"
    | "attempts"
  >> = {}
) {
  const data = await readStore(stravaWebhookStoreId);
  let updated: StravaWebhookEvent | undefined;
  const events = (data.stravaWebhookEvents ?? []).map((event) => {
    if (event.id !== eventId) return event;
    updated = {
      ...event,
      status,
      ...metadata
    };
    return updated;
  });
  if (!updated) return undefined;
  await writeStore(stravaWebhookStoreId, { ...data, stravaWebhookEvents: events });
  return updated;
}

export async function getStravaWebhookEventCounts() {
  const data = await readStore(stravaWebhookStoreId);
  return stravaWebhookEventCounts(data.stravaWebhookEvents ?? []);
}

export async function recordStravaWebhookProcessorRun(runAt: string, summary: StravaWebhookProcessorRunSummary) {
  const data = await readStore(stravaWebhookStoreId);
  const run: StravaWebhookProcessorRun = { runAt, ...summary };
  const webhookProcessingRuns = [...(data.webhookProcessingRuns ?? []), run].slice(
    -maxStoredStravaWebhookProcessorRuns
  );
  await writeStore(stravaWebhookStoreId, {
    ...data,
    lastWebhookProcessorRunAt: runAt,
    lastWebhookProcessorSummary: summary,
    webhookProcessingRuns
  });
  return run;
}

export async function getStravaWebhookProcessorMetadata() {
  const data = await readStore(stravaWebhookStoreId);
  return {
    lastWebhookProcessorRunAt: data.lastWebhookProcessorRunAt,
    lastWebhookProcessorSummary: data.lastWebhookProcessorSummary,
    webhookProcessingRuns: data.webhookProcessingRuns ?? []
  };
}

export async function findUserIdByStravaAthleteId(athleteId: number): Promise<string | undefined> {
  const database = getPool();
  if (database) return findDatabaseUserIdByStravaAthleteId(database, athleteId);
  return findFileUserIdByStravaAthleteId(athleteId);
}

async function findDatabaseUserIdByStravaAthleteId(database: Pool, athleteId: number) {
  await ensureSchema();
  const result = await database.query<{ id: string }>(
    `
      select id
      from trainingtweaks_app_state
      where id like 'user:%'
        and (data #>> '{strava,athleteId}') = $1
      order by updated_at desc
      limit 1
    `,
    [String(athleteId)]
  );
  return userIdFromAppStateId(result.rows[0]?.id);
}

async function findFileUserIdByStravaAthleteId(athleteId: number) {
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = await readdir(usersStoreDirectory(), { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const userId = decodeURIComponent(entry.name);
    if (userId === stravaWebhookStoreId) continue;
    const data = await readFileStore(userId);
    if (data.strava?.athleteId === athleteId) return userId;
  }
  return undefined;
}

function appStateIdForUser(userId: string) {
  return `user:${userId}`;
}

function userIdFromAppStateId(id: string | undefined) {
  return id?.startsWith("user:") ? id.slice("user:".length) : undefined;
}

function usersStoreDirectory() {
  return join(process.cwd(), ".data", "users");
}

function storePathForUser(userId: string) {
  return join(usersStoreDirectory(), encodeURIComponent(userId), "trainingtweaks.json");
}

function mergeActivity(existing: Activity | undefined, next: Activity): Activity {
  if (!existing) return next;

  return {
    ...existing,
    ...next,
    bestEfforts: next.bestEfforts ?? existing.bestEfforts,
    streams: next.streams ?? existing.streams,
    streamSync: next.streamSync ?? existing.streamSync,
    streamSummary: next.streamSummary ?? existing.streamSummary,
    averageCadence: next.averageCadence ?? existing.averageCadence,
    relativeEffort: next.relativeEffort ?? existing.relativeEffort,
    averageHeartRate: next.averageHeartRate ?? existing.averageHeartRate,
    maxHeartRate: next.maxHeartRate ?? existing.maxHeartRate
  };
}
