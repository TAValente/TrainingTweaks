import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { getDatabasePoolConfig } from "./database";
import type { AppData, Activity, StoredModelRun, StravaTokenSet, TrainingContext } from "./types";

const storePath = join(process.cwd(), ".data", "trainingtweaks.json");
const appStateId = "default";
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

async function readStore(): Promise<AppData> {
  const database = getPool();
  if (database) return readDatabaseStore(database);
  return readFileStore();
}

async function readDatabaseStore(database: Pool): Promise<AppData> {
  await ensureSchema();
  const result = await database.query<{ data: AppData }>(
    "select data from trainingtweaks_app_state where id = $1",
    [appStateId]
  );
  const data = result.rows[0]?.data;
  return {
    ...emptyData(),
    ...data,
    activities: data?.activities ?? [],
    modelRuns: data?.modelRuns ?? []
  };
}

async function readFileStore(): Promise<AppData> {
  try {
    const raw = await readFile(storePath, "utf8");
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

async function writeStore(data: AppData) {
  const database = getPool();
  if (database) {
    await writeDatabaseStore(database, data);
    return;
  }

  await writeFileStore(data);
}

async function writeDatabaseStore(database: Pool, data: AppData) {
  await ensureSchema();
  await database.query(
    `
      insert into trainingtweaks_app_state (id, data, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set data = excluded.data, updated_at = now()
    `,
    [appStateId, JSON.stringify(data)]
  );
}

async function writeFileStore(data: AppData) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2), "utf8");
}

export async function getData() {
  return readStore();
}

export async function saveStravaTokens(tokens: StravaTokenSet) {
  const data = await readStore();
  await writeStore({ ...data, strava: tokens });
}

export async function saveActivities(activities: Activity[]) {
  const data = await readStore();
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

  await writeStore({
    ...data,
    activities: sorted,
    lastRefreshAt: new Date().toISOString()
  });
  return sorted;
}

export async function saveContext(context: TrainingContext) {
  const data = await readStore();
  await writeStore({ ...data, context });
}

export async function appendModelRun(modelRun: StoredModelRun) {
  const data = await readStore();
  const modelRuns = [...(data.modelRuns ?? []), modelRun].slice(-maxStoredModelRuns);
  await writeStore({ ...data, modelRuns });
}

function mergeActivity(existing: Activity | undefined, next: Activity): Activity {
  if (!existing) return next;

  return {
    ...existing,
    ...next,
    bestEfforts: next.bestEfforts ?? existing.bestEfforts,
    averageCadence: next.averageCadence ?? existing.averageCadence,
    relativeEffort: next.relativeEffort ?? existing.relativeEffort,
    averageHeartRate: next.averageHeartRate ?? existing.averageHeartRate,
    maxHeartRate: next.maxHeartRate ?? existing.maxHeartRate
  };
}
