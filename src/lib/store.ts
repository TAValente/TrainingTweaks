import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { getDatabasePoolConfig } from "./database";
import { redactModelRun } from "./model-runs";
import type { AppData, Activity, ModelRunFeedback, StoredModelRun, StravaTokenSet, TrainingContext } from "./types";

const maxStoredModelRuns = 100;
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
    modelRuns: data?.modelRuns ?? []
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
      modelRuns: parsed.modelRuns ?? []
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

function appStateIdForUser(userId: string) {
  return `user:${userId}`;
}

function storePathForUser(userId: string) {
  return join(process.cwd(), ".data", "users", encodeURIComponent(userId), "trainingtweaks.json");
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
