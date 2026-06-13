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

export type StravaTodayCheckConfig = {
  overlapDays: number;
  pageLimit: number;
  perPage: number;
  fetchTimeoutMs: number;
};

export type StravaTodayCheckWindow = {
  after: number;
  afterIso: string;
  overlapDays: number;
};

export type StravaTodayCheckResult =
  | "updated"
  | "no_new_activity"
  | "using_last_sync"
  | "error";

export type StravaTodayCheckContract = {
  activityFetch: {
    pageLimit: number;
    perPage: number;
    timeoutMs: number;
  };
  detailSync: false;
  streamSync: false;
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

export function stravaTodayCheckConfig(env: Record<string, string | undefined> = process.env): StravaTodayCheckConfig {
  return {
    overlapDays: envPositiveInteger(env.STRAVA_TODAY_CHECK_OVERLAP_DAYS, 1),
    pageLimit: envPositiveInteger(env.STRAVA_TODAY_CHECK_PAGE_LIMIT, 1),
    perPage: envPositiveInteger(env.STRAVA_TODAY_CHECK_PER_PAGE, 50),
    fetchTimeoutMs: envPositiveInteger(env.STRAVA_TODAY_CHECK_TIMEOUT_MS, 4000)
  };
}

export function stravaTodayCheckContract(env: Record<string, string | undefined> = process.env): StravaTodayCheckContract {
  const config = stravaTodayCheckConfig(env);
  return {
    activityFetch: {
      pageLimit: config.pageLimit,
      perPage: config.perPage,
      timeoutMs: config.fetchTimeoutMs
    },
    detailSync: false,
    streamSync: false
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

export function stravaTodayCheckWindow(input: {
  localDate: string;
  lastRefreshAt?: string;
  config?: Pick<StravaTodayCheckConfig, "overlapDays">;
}): StravaTodayCheckWindow {
  const config = input.config ?? stravaTodayCheckConfig();
  const localMidnight = parseLocalIsoDate(input.localDate) ?? new Date();
  const todayAnchor = addDays(localMidnight, -config.overlapDays);
  const lastRefreshDate = parseValidDate(input.lastRefreshAt);
  const lastRefreshAnchor = lastRefreshDate ? addDays(lastRefreshDate, -config.overlapDays) : undefined;
  const anchor = lastRefreshAnchor && lastRefreshAnchor > todayAnchor ? lastRefreshAnchor : todayAnchor;

  return {
    after: unixSeconds(anchor),
    afterIso: anchor.toISOString(),
    overlapDays: config.overlapDays
  };
}

export function todayCheckStatusCopy(result: StravaTodayCheckResult, importedCount = 0) {
  if (result === "updated") return importedCount > 0 ? "Updated from latest sync." : "Updated from stored sync.";
  if (result === "no_new_activity") return "No new run found.";
  if (result === "using_last_sync") return "Using last sync; Strava was slow.";
  return "Couldn't reach Strava. Plan unchanged.";
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

function parseLocalIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}
