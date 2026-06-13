import type {
  Activity,
  ActivityStreams,
  ActivityStreamSummary,
  BestEffort,
  StravaStreamType,
  StravaTokenSet
} from "./types.ts";
import { getOptionalEnv, getRequiredEnv } from "./env.ts";

type FetchImpl = typeof fetch;

type StravaActivity = {
  id: number;
  name?: string;
  start_date: string;
  sport_type?: string;
  type?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain?: number;
  perceived_exertion?: number;
  suffer_score?: number;
  best_efforts?: StravaBestEffort[];
};

type StravaBestEffort = {
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  start_date?: string;
};

type StravaStream = {
  type: StravaStreamType;
  data?: Array<number | boolean | [number, number]>;
  series_type?: string;
  original_size?: number;
  resolution?: string;
};

export type StravaStreamSyncMode = "full" | "selective" | "off";

export type StravaStreamSyncResult = {
  activities: Activity[];
  attemptedCount: number;
  fetchedCount: number;
  failedCount: number;
  unavailableCount: number;
  skippedCount: number;
  rateLimited: boolean;
  remainingCount: number;
  mode: StravaStreamSyncMode;
};

export type StravaActivityFetchResult = {
  activities: Activity[];
  after: number;
  pageLimit: number;
  pageCount: number;
  perPage: number;
};

export type StravaDetailSyncResult = {
  activities: Activity[];
  attemptedCount: number;
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
};

type StravaFetchOptions = {
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
};

type StravaActivityFetchOptions = StravaFetchOptions & {
  after?: number;
  pageLimit?: number;
  perPage?: number;
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id?: number };
};

export function getBaseUrl() {
  const appBaseUrl = getOptionalEnv("APP_BASE_URL");
  if (appBaseUrl) return appBaseUrl.replace(/\/$/, "");

  const vercelProductionUrl = getOptionalEnv("VERCEL_PROJECT_PRODUCTION_URL");
  if (vercelProductionUrl) return normalizeUrl(vercelProductionUrl);

  const vercelDeploymentUrl = getOptionalEnv("VERCEL_URL");
  if (vercelDeploymentUrl) return normalizeUrl(vercelDeploymentUrl);

  const domain = getOptionalEnv("STRAVA_CALLBACK_DOMAIN") || "localhost";
  if (domain === "localhost") return "http://localhost:3000";
  return normalizeUrl(domain);
}

export function getStravaRedirectUri() {
  return `${getBaseUrl()}/api/strava/callback`;
}

export function getStravaAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: getRequiredEnv("STRAVA_CLIENT_ID"),
    redirect_uri: getStravaRedirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all"
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, options: StravaFetchOptions = {}): Promise<StravaTokenSet> {
  const response = await stravaFetch("token exchange", "https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: getRequiredEnv("STRAVA_CLIENT_ID"),
      client_secret: getRequiredEnv("STRAVA_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code"
    })
  }, options);

  if (!response.ok) {
    throw new Error(`Strava token exchange failed: ${response.status} ${await response.text()}`);
  }

  const tokens = (await response.json()) as StravaTokenResponse;
  return mapTokenResponse(tokens);
}

export async function refreshTokensIfNeeded(tokens: StravaTokenSet, options: StravaFetchOptions = {}): Promise<StravaTokenSet> {
  const expiresSoon = tokens.expiresAt <= Math.floor(Date.now() / 1000) + 300;
  if (!expiresSoon) return tokens;

  const response = await stravaFetch("token refresh", "https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: getRequiredEnv("STRAVA_CLIENT_ID"),
      client_secret: getRequiredEnv("STRAVA_CLIENT_SECRET"),
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token"
    })
  }, options);

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status} ${await response.text()}`);
  }

  const refreshed = mapTokenResponse((await response.json()) as StravaTokenResponse);
  return { ...refreshed, athleteId: tokens.athleteId ?? refreshed.athleteId };
}

export async function fetchRecentStravaActivities(
  accessToken: string,
  options: StravaActivityFetchOptions = {}
): Promise<StravaActivityFetchResult> {
  const after = options.after ?? Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);
  const pageLimit = positiveInteger(options.pageLimit, 3);
  const perPage = positiveInteger(options.perPage, 200);
  const activities: Activity[] = [];
  let pageCount = 0;

  for (let page = 1; page <= pageLimit; page += 1) {
    const params = new URLSearchParams({
      after: String(after),
      page: String(page),
      per_page: String(perPage)
    });

    const response = await stravaFetch("activity list fetch", `https://www.strava.com/api/v3/athlete/activities?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }, options);

    if (!response.ok) {
      throw new Error(`Strava activity refresh failed: ${response.status} ${await response.text()}`);
    }

    const pageActivities = (await response.json()) as StravaActivity[];
    pageCount += 1;
    activities.push(...pageActivities.map(normalizeStravaActivity));
    if (pageActivities.length < perPage) break;
  }

  return {
    activities,
    after,
    pageLimit,
    pageCount,
    perPage
  };
}

export async function fetchDetailedRunActivities(
  accessToken: string,
  activities: Activity[],
  existingActivities: Activity[],
  options: StravaFetchOptions = {}
): Promise<StravaDetailSyncResult> {
  const detailLimit = positiveInteger(Number(getOptionalEnv("STRAVA_DETAIL_SYNC_LIMIT", "30")), 30);
  const existingById = new Map(existingActivities.map((activity) => [activity.providerActivityId, activity]));
  const runsNeedingDetails = activities
    .filter((activity) => activity.sportType.toLowerCase().includes("run"))
    .filter((activity) => !existingById.get(activity.providerActivityId)?.bestEfforts?.length)
    .slice(0, detailLimit);

  const detailedActivities: Activity[] = [];
  let failedCount = 0;
  for (const activity of runsNeedingDetails) {
    try {
      const response = await stravaFetch(
        "activity detail fetch",
        `https://www.strava.com/api/v3/activities/${activity.providerActivityId}?include_all_efforts=false`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: "no-store"
        },
        options
      );

      if (!response.ok) {
        failedCount += 1;
        continue;
      }
      detailedActivities.push(normalizeStravaActivity((await response.json()) as StravaActivity));
    } catch {
      failedCount += 1;
    }
  }

  return {
    activities: detailedActivities,
    attemptedCount: runsNeedingDetails.length,
    syncedCount: detailedActivities.length,
    failedCount,
    remainingCount: Math.max(0, runsNeedingDetails.length - detailedActivities.length)
  };
}

export async function fetchRunActivityStreams(
  accessToken: string,
  activities: Activity[],
  options: StravaFetchOptions = {}
): Promise<StravaStreamSyncResult> {
  const mode = streamSyncMode();
  if (mode === "off") {
    return emptyStreamSyncResult(mode, activities.filter(isRun).length);
  }

  const limit = streamSyncLimit(mode);
  const easyPaceSecondsPerKm = easyPaceBaseline(activities);
  const candidates = activities
    .filter(isRun)
    .filter((activity) => shouldAttemptStreamSync(activity, mode))
    .sort(byNewestStartDate)
    .slice(0, limit);
  const enriched: Activity[] = [];
  let attemptedCount = 0;
  let fetchedCount = 0;
  let failedCount = 0;
  let unavailableCount = 0;
  let rateLimited = false;

  for (const activity of candidates) {
    attemptedCount += 1;
    const attemptedAt = new Date().toISOString();
    try {
      const streams = await fetchStravaActivityStreams(accessToken, activity.providerActivityId, undefined, options);
      const normalizedStreams = normalizeStreams(streams);
      const streamTypes = Object.keys(normalizedStreams) as StravaStreamType[];
      if (!streamTypes.length) {
        unavailableCount += 1;
        enriched.push({
          ...activity,
          streamSync: {
            status: "unavailable",
            mode,
            attemptedAt,
            failedAt: attemptedAt,
            unavailableReason: "Strava returned no streams for this activity.",
            streamTypes: []
          }
        });
        continue;
      }

      fetchedCount += 1;
      enriched.push({
        ...activity,
        streams: normalizedStreams,
        streamSummary: summarizeStravaActivityStreams(normalizedStreams, easyPaceSecondsPerKm),
        streamSync: {
          status: "fetched",
          mode,
          attemptedAt,
          fetchedAt: attemptedAt,
          streamTypes
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown stream sync error.";
      if (message.includes("429")) {
        rateLimited = true;
        enriched.push({
          ...activity,
          streamSync: {
            status: "rate_limited",
            mode,
            attemptedAt,
            failedAt: attemptedAt,
            failureReason: message
          }
        });
        break;
      }
      failedCount += 1;
      enriched.push({
        ...activity,
        streamSync: {
          status: "failed",
          mode,
          attemptedAt,
          failedAt: attemptedAt,
          failureReason: message
        }
      });
    }
  }

  const remainingCount = Math.max(0, activities.filter(isRun).filter((activity) => shouldAttemptStreamSync(activity, mode)).length - attemptedCount);
  return {
    activities: enriched,
    attemptedCount,
    fetchedCount,
    failedCount,
    unavailableCount,
    skippedCount: Math.max(0, activities.filter(isRun).length - candidates.length),
    rateLimited,
    remainingCount,
    mode
  };
}

export async function fetchStravaActivityStreams(
  accessToken: string,
  providerActivityId: string,
  keys: StravaStreamType[] = ["time", "distance", "velocity_smooth", "moving", "heartrate", "cadence", "altitude", "grade_smooth"],
  options: StravaFetchOptions = {}
) {
  const params = new URLSearchParams({
    keys: keys.join(","),
    key_by_type: "true"
  });
  const response = await stravaFetch("stream fetch", `https://www.strava.com/api/v3/activities/${providerActivityId}/streams?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  }, options);

  if (!response.ok) {
    throw new Error(`Strava activity streams fetch failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<Partial<Record<StravaStreamType, StravaStream>>>;
}

export function summarizeStravaActivityStreams(
  streams: Partial<Record<StravaStreamType, Pick<StravaStream, "data" | "type" | "series_type" | "original_size" | "resolution">>>,
  easyPaceSecondsPerKm?: number
): ActivityStreamSummary {
  const time = numericStream(streams.time);
  const velocity = numericStream(streams.velocity_smooth);
  const moving = booleanStream(streams.moving);
  const grade = numericStream(streams.grade_smooth);
  const distance = numericStream(streams.distance);
  const availableTypes = Object.keys(streams) as StravaStreamType[];
  const fastVelocityMetersPerSecond = easyPaceSecondsPerKm ? 1000 / (easyPaceSecondsPerKm * 0.9) : undefined;
  let fastRunningSeconds = 0;
  let movingSeconds = 0;
  let downhillMeters = 0;
  let sharpPaceChangeCount = 0;

  for (let index = 1; index < time.length; index += 1) {
    const seconds = Math.max(0, time[index] - time[index - 1]);
    const isMoving = moving[index] !== false;
    if (isMoving) movingSeconds += seconds;
    if (isMoving && fastVelocityMetersPerSecond && (velocity[index] ?? 0) >= fastVelocityMetersPerSecond) {
      fastRunningSeconds += seconds;
    }
    if (isMoving && (grade[index] ?? 0) <= -3 && distance[index] !== undefined && distance[index - 1] !== undefined) {
      downhillMeters += Math.max(0, distance[index] - distance[index - 1]);
    }
    if (Math.abs((velocity[index] ?? 0) - (velocity[index - 1] ?? 0)) >= 1.2) {
      sharpPaceChangeCount += 1;
    }
  }

  return {
    source: "strava_streams",
    fetchedAt: new Date().toISOString(),
    availableTypes,
    sampleCount: time.length || velocity.length || distance.length,
    movingSeconds: movingSeconds || undefined,
    fastRunningSeconds: fastVelocityMetersPerSecond ? Math.round(fastRunningSeconds) : undefined,
    fastRunningSource: fastVelocityMetersPerSecond ? "personalized_stream_zone" : undefined,
    fastRunningConfidence: fastVelocityMetersPerSecond ? "medium" : "low",
    downhillMeters: Math.round(downhillMeters) || undefined,
    sharpPaceChangeCount: sharpPaceChangeCount || undefined
  };
}

function normalizeStreams(streams: Partial<Record<StravaStreamType, StravaStream>>): ActivityStreams {
  return Object.fromEntries(
    Object.entries(streams).flatMap(([key, stream]) => {
      if (!stream?.data?.length) return [];
      return [[key, {
        type: stream.type ?? key,
        data: stream.data,
        seriesType: stream.series_type,
        originalSize: stream.original_size,
        resolution: stream.resolution
      }]];
    })
  ) as ActivityStreams;
}

function mapTokenResponse(tokens: StravaTokenResponse): StravaTokenSet {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_at,
    athleteId: tokens.athlete?.id
  };
}

function normalizeStravaActivity(activity: StravaActivity): Activity {
  const distanceMeters = optionalNumber(activity.distance);
  const movingTimeSeconds = optionalNumber(activity.moving_time);
  const averagePaceSecondsPerKm =
    distanceMeters && movingTimeSeconds && distanceMeters > 0
      ? movingTimeSeconds / (distanceMeters / 1000)
      : undefined;

  return {
    provider: "strava",
    providerActivityId: String(activity.id),
    startDate: activity.start_date,
    sportType: activity.sport_type ?? activity.type ?? "Unknown",
    name: activity.name,
    distanceMeters,
    movingTimeSeconds,
    elapsedTimeSeconds: optionalNumber(activity.elapsed_time),
    averagePaceSecondsPerKm,
    averageHeartRate: optionalNumber(activity.average_heartrate),
    maxHeartRate: optionalNumber(activity.max_heartrate),
    averageCadence: optionalNumber(activity.average_cadence),
    elevationGainMeters: optionalNumber(activity.total_elevation_gain),
    perceivedEffort: optionalNumber(activity.perceived_exertion),
    relativeEffort: optionalNumber(activity.suffer_score),
    bestEfforts: normalizeBestEfforts(activity.best_efforts)
  };
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeBestEfforts(bestEfforts?: StravaBestEffort[]): BestEffort[] | undefined {
  const normalized = bestEfforts
    ?.map((effort) => ({
      name: effort.name,
      distanceMeters: optionalNumber(effort.distance) ?? 0,
      movingTimeSeconds: optionalNumber(effort.moving_time),
      elapsedTimeSeconds: optionalNumber(effort.elapsed_time),
      startDate: effort.start_date
    }))
    .filter((effort) => effort.distanceMeters > 0);

  return normalized?.length ? normalized : undefined;
}

function streamSyncMode(): StravaStreamSyncMode {
  // Normal refresh powers the Today surface, so streams are enrichment only.
  // Default to selective to avoid turning the refresh button into a historical stream backfill.
  const mode = getOptionalEnv("STRAVA_STREAM_SYNC_MODE", "selective");
  if (mode === "off" || mode === "selective") return mode;
  return "full";
}

function streamSyncLimit(mode: StravaStreamSyncMode) {
  const fallback = mode === "full" ? "30" : "5";
  const parsed = Number(getOptionalEnv("STRAVA_STREAM_SYNC_LIMIT", fallback));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : Number(fallback);
}

function shouldAttemptStreamSync(activity: Activity, mode: StravaStreamSyncMode) {
  if (activity.streamSync?.status === "fetched" && activity.streams && activity.streamSummary) return false;
  if (activity.streamSync?.status === "unavailable") return false;
  if (mode === "selective" && !isLikelyStreamCandidate(activity)) return false;
  return true;
}

function isLikelyStreamCandidate(activity: Activity) {
  const name = activity.name?.toLowerCase() ?? "";
  return ["workout", "race", "tempo", "threshold", "interval", "speed", "fartlek", "long"].some((keyword) => name.includes(keyword));
}

function emptyStreamSyncResult(mode: StravaStreamSyncMode, runCount: number): StravaStreamSyncResult {
  return {
    activities: [],
    attemptedCount: 0,
    fetchedCount: 0,
    failedCount: 0,
    unavailableCount: 0,
    skippedCount: runCount,
    rateLimited: false,
    remainingCount: runCount,
    mode
  };
}

function easyPaceBaseline(activities: Activity[]) {
  return medianDefined(
    activities
      .filter(isRun)
      .filter((activity) => !isLikelyStreamCandidate(activity))
      .map((activity) => activity.averagePaceSecondsPerKm)
  ) ?? medianDefined(activities.filter(isRun).map((activity) => activity.averagePaceSecondsPerKm));
}

function numericStream(stream?: StravaStream) {
  return (stream?.data ?? []).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function booleanStream(stream?: StravaStream) {
  return (stream?.data ?? []).filter((value): value is boolean => typeof value === "boolean");
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function byNewestStartDate(left: Activity, right: Activity) {
  return new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
}

function medianDefined(values: Array<number | undefined>) {
  const sorted = values.filter((value): value is number => value !== undefined && Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function normalizeUrl(value: string) {
  const withoutTrailingSlash = value.replace(/\/$/, "");
  if (withoutTrailingSlash.startsWith("http")) return withoutTrailingSlash;
  return `https://${withoutTrailingSlash}`;
}

async function stravaFetch(
  phase: "token exchange" | "token refresh" | "activity list fetch" | "activity detail fetch" | "stream fetch",
  input: string,
  init: RequestInit,
  options: StravaFetchOptions
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = positiveInteger(options.timeoutMs, 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Strava ${phase} timed out after ${timeoutMs}ms.`);
    }
    const message = error instanceof Error ? error.message : "Unknown network error.";
    throw new Error(`Strava ${phase} failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
