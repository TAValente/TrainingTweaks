import assert from "node:assert/strict";
import test from "node:test";
import { fetchDetailedRunActivities, fetchRecentStravaActivities, fetchRunActivityStreams } from "./strava.ts";
import { stravaRefreshConfig, stravaRefreshWindow } from "./strava-refresh.ts";
import type { Activity } from "./types.ts";

test("lastRefreshAt uses incremental window with overlap days", () => {
  const window = stravaRefreshWindow({
    lastRefreshAt: "2026-06-10T12:00:00.000Z",
    now: new Date("2026-06-13T12:00:00.000Z"),
    config: { overlapDays: 2, initialSyncDays: 180 }
  });

  assert.equal(window.mode, "incremental");
  assert.equal(window.after, Date.parse("2026-06-08T12:00:00.000Z") / 1000);
  assert.equal(window.afterIso, "2026-06-08T12:00:00.000Z");
});

test("missing lastRefreshAt uses bounded initial sync window", () => {
  const window = stravaRefreshWindow({
    now: new Date("2026-06-13T12:00:00.000Z"),
    config: { overlapDays: 2, initialSyncDays: 180 }
  });

  assert.equal(window.mode, "initial");
  assert.equal(window.after, Date.parse("2025-12-15T12:00:00.000Z") / 1000);
});

test("invalid env values fall back safely", () => {
  const config = stravaRefreshConfig({
    STRAVA_REFRESH_OVERLAP_DAYS: "-1",
    STRAVA_INITIAL_SYNC_DAYS: "nope",
    STRAVA_ACTIVITY_REFRESH_PAGE_LIMIT: "0",
    STRAVA_FETCH_TIMEOUT_MS: ""
  });

  assert.deepEqual(config, {
    overlapDays: 2,
    initialSyncDays: 180,
    pageLimit: 3,
    fetchTimeoutMs: 12000
  });
});

test("overlap uses exact elapsed days from the refresh timestamp", () => {
  const window = stravaRefreshWindow({
    lastRefreshAt: "2026-06-10T03:30:00.000Z",
    config: { overlapDays: 1, initialSyncDays: 180 }
  });

  assert.equal(window.afterIso, "2026-06-09T03:30:00.000Z");
});

test("activity page limit is respected", async () => {
  const requestedPages: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requestedPages.push(url.searchParams.get("page") ?? "");
    return jsonResponse([
      {
        id: Number(url.searchParams.get("page")),
        name: "Easy run",
        start_date: "2026-06-13T12:00:00Z",
        sport_type: "Run",
        distance: 1609.344,
        moving_time: 600
      }
    ]);
  };

  const result = await fetchRecentStravaActivities("token", {
    after: 123,
    pageLimit: 2,
    perPage: 1,
    fetchImpl
  });

  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.equal(result.pageCount, 2);
  assert.equal(result.activities.length, 2);
});

test("detail failure returns partial success summary", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("details unavailable");
  };
  const result = await fetchDetailedRunActivities("token", [run("1", "Tempo run")], [], { fetchImpl });

  assert.equal(result.attemptedCount, 1);
  assert.equal(result.syncedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.remainingCount, 1);
});

test("stream failure returns partial success summary", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("streams unavailable");
  };
  const result = await fetchRunActivityStreams("token", [run("1", "Tempo workout")], { fetchImpl });

  assert.equal(result.attemptedCount, 1);
  assert.equal(result.fetchedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.rateLimited, false);
});

test("no new activities returns an empty bounded fetch summary", async () => {
  const result = await fetchRecentStravaActivities("token", {
    after: 123,
    pageLimit: 3,
    fetchImpl: async () => jsonResponse([])
  });

  assert.equal(result.activities.length, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pageLimit, 3);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function run(id: string, name: string): Activity {
  return {
    provider: "strava",
    providerActivityId: id,
    startDate: "2026-06-13T12:00:00Z",
    sportType: "Run",
    name,
    distanceMeters: 1609.344,
    movingTimeSeconds: 600
  };
}
