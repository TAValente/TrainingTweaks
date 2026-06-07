import assert from "node:assert/strict";
import test from "node:test";
import { activityForClient } from "./activity-serialization.ts";
import type { Activity } from "./types.ts";

test("client activity serialization strips raw streams but preserves stream metadata", () => {
  const activity: Activity = {
    provider: "strava",
    providerActivityId: "activity-1",
    sportType: "Run",
    startDate: "2026-06-05T12:00:00.000Z",
    streams: {
      time: { type: "time", data: [0, 1, 2] },
      velocity_smooth: { type: "velocity_smooth", data: [2.5, 3.1, 2.8] }
    },
    streamSummary: {
      source: "strava_streams",
      fetchedAt: "2026-06-05T12:01:00.000Z",
      availableTypes: ["time", "velocity_smooth"],
      sampleCount: 3,
      fastRunningSeconds: 1
    },
    streamSync: {
      status: "fetched",
      mode: "full",
      fetchedAt: "2026-06-05T12:01:00.000Z"
    }
  };

  const serialized = activityForClient(activity);
  assert.equal("streams" in serialized, false);
  assert.equal(serialized.streamSummary?.fastRunningSeconds, 1);
  assert.equal(serialized.streamSync?.status, "fetched");
});
