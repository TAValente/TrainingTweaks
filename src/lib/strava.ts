import type { Activity, BestEffort, StravaTokenSet } from "./types";
import { getOptionalEnv, getRequiredEnv } from "./env";

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

export async function exchangeCodeForTokens(code: string): Promise<StravaTokenSet> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: getRequiredEnv("STRAVA_CLIENT_ID"),
      client_secret: getRequiredEnv("STRAVA_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(`Strava token exchange failed: ${response.status} ${await response.text()}`);
  }

  const tokens = (await response.json()) as StravaTokenResponse;
  return mapTokenResponse(tokens);
}

export async function refreshTokensIfNeeded(tokens: StravaTokenSet): Promise<StravaTokenSet> {
  const expiresSoon = tokens.expiresAt <= Math.floor(Date.now() / 1000) + 300;
  if (!expiresSoon) return tokens;

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: getRequiredEnv("STRAVA_CLIENT_ID"),
      client_secret: getRequiredEnv("STRAVA_CLIENT_SECRET"),
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status} ${await response.text()}`);
  }

  const refreshed = mapTokenResponse((await response.json()) as StravaTokenResponse);
  return { ...refreshed, athleteId: tokens.athleteId ?? refreshed.athleteId };
}

export async function fetchRecentStravaActivities(accessToken: string) {
  const fiveYearsAgo = Math.floor((Date.now() - 1825 * 24 * 60 * 60 * 1000) / 1000);
  const activities: Activity[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      after: String(fiveYearsAgo),
      page: String(page),
      per_page: "200"
    });

    const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Strava activity refresh failed: ${response.status} ${await response.text()}`);
    }

    const pageActivities = (await response.json()) as StravaActivity[];
    activities.push(...pageActivities.map(normalizeStravaActivity));
    if (pageActivities.length < 200) break;
  }

  return activities;
}

export async function fetchDetailedRunActivities(
  accessToken: string,
  activities: Activity[],
  existingActivities: Activity[]
) {
  const detailLimit = Number(getOptionalEnv("STRAVA_DETAIL_SYNC_LIMIT", "30"));
  const existingById = new Map(existingActivities.map((activity) => [activity.providerActivityId, activity]));
  const runsNeedingDetails = activities
    .filter((activity) => activity.sportType.toLowerCase().includes("run"))
    .filter((activity) => !existingById.get(activity.providerActivityId)?.bestEfforts?.length)
    .slice(0, detailLimit);

  const detailedActivities: Activity[] = [];
  for (const activity of runsNeedingDetails) {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activity.providerActivityId}?include_all_efforts=false`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      }
    );

    if (!response.ok) continue;
    detailedActivities.push(normalizeStravaActivity((await response.json()) as StravaActivity));
  }

  return {
    activities: detailedActivities,
    syncedCount: detailedActivities.length,
    remainingCount: Math.max(0, runsNeedingDetails.length - detailedActivities.length)
  };
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

function normalizeUrl(value: string) {
  const withoutTrailingSlash = value.replace(/\/$/, "");
  if (withoutTrailingSlash.startsWith("http")) return withoutTrailingSlash;
  return `https://${withoutTrailingSlash}`;
}
