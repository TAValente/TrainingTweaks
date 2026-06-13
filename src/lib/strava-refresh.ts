export type StravaRefreshConfig = {
  overlapDays: number;
  initialSyncDays: number;
  pageLimit: number;
  fetchTimeoutMs: number;
};

export type StravaRefreshWindow = {
  after: number;
  afterIso: string;
  mode: "incremental" | "initial";
  overlapDays: number;
  initialSyncDays: number;
};

const secondsPerDay = 24 * 60 * 60;
const millisecondsPerDay = secondsPerDay * 1000;

export function stravaRefreshConfig(env: Record<string, string | undefined> = process.env): StravaRefreshConfig {
  return {
    overlapDays: envPositiveInteger(env.STRAVA_REFRESH_OVERLAP_DAYS, 2),
    initialSyncDays: envPositiveInteger(env.STRAVA_INITIAL_SYNC_DAYS, 180),
    pageLimit: envPositiveInteger(env.STRAVA_ACTIVITY_REFRESH_PAGE_LIMIT, 3),
    fetchTimeoutMs: envPositiveInteger(env.STRAVA_FETCH_TIMEOUT_MS, 12000)
  };
}

export function stravaRefreshWindow(input: {
  lastRefreshAt?: string;
  now?: Date;
  config?: Pick<StravaRefreshConfig, "overlapDays" | "initialSyncDays">;
}): StravaRefreshWindow {
  const config = input.config ?? stravaRefreshConfig();
  const now = input.now ?? new Date();
  const lastRefreshDate = parseValidDate(input.lastRefreshAt);
  const anchor = lastRefreshDate
    ? addDays(lastRefreshDate, -config.overlapDays)
    : addDays(now, -config.initialSyncDays);

  return {
    after: unixSeconds(anchor),
    afterIso: anchor.toISOString(),
    mode: lastRefreshDate ? "incremental" : "initial",
    overlapDays: config.overlapDays,
    initialSyncDays: config.initialSyncDays
  };
}

function envPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseValidDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}
