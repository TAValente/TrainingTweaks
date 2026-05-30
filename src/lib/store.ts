import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppData, Activity, StravaTokenSet, TrainingContext } from "./types";

const storePath = join(process.cwd(), ".data", "trainingtweaks.json");

function emptyData(): AppData {
  return {
  activities: []
  };
}

async function readStore(): Promise<AppData> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as AppData;
    return {
      ...emptyData(),
      ...parsed,
      activities: parsed.activities ?? []
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyData();
    throw error;
  }
}

async function writeStore(data: AppData) {
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
    merged.set(`${activity.provider}:${activity.providerActivityId}`, activity);
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
