import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  authorizeCronStravaWebhookProcess,
  authorizeManualStravaWebhookProcess,
  isVercelCronRequest,
  parseStravaWebhookProcessLimit,
  stravaWebhookProcessDefaultLimit,
  stravaWebhookProcessMaxLimit
} from "./strava-webhook-process-route.ts";

test("cron processing rejects ordinary public requests", () => {
  assert.equal(
    authorizeCronStravaWebhookProcess({
      userAgent: "Mozilla/5.0",
      providedSecret: undefined,
      expectedSecret: "process-secret"
    }),
    false
  );
});

test("cron processing accepts Vercel cron signal or configured secret", () => {
  assert.equal(isVercelCronRequest("vercel-cron/1.0"), true);
  assert.equal(
    authorizeCronStravaWebhookProcess({
      userAgent: "vercel-cron/1.0",
      providedSecret: undefined,
      expectedSecret: "process-secret"
    }),
    true
  );
  assert.equal(
    authorizeCronStravaWebhookProcess({
      userAgent: "Mozilla/5.0",
      providedSecret: "process-secret",
      expectedSecret: "process-secret"
    }),
    true
  );
});

test("processor routes use bounded default and explicit safe limits", () => {
  assert.equal(parseStravaWebhookProcessLimit(undefined), stravaWebhookProcessDefaultLimit);
  assert.equal(parseStravaWebhookProcessLimit("10"), 10);
  assert.equal(parseStravaWebhookProcessLimit("1000"), stravaWebhookProcessMaxLimit);
  assert.equal(parseStravaWebhookProcessLimit("-1"), stravaWebhookProcessDefaultLimit);
});

test("manual processing requires configured matching secret", () => {
  assert.equal(
    authorizeManualStravaWebhookProcess({
      providedSecret: undefined,
      expectedSecret: "process-secret"
    }),
    false
  );
  assert.equal(
    authorizeManualStravaWebhookProcess({
      providedSecret: "process-secret",
      expectedSecret: "process-secret"
    }),
    true
  );
});

test("Vercel cron config schedules the Strava webhook processor", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };

  assert.deepEqual(config.crons, [
    {
      path: "/api/strava/webhook/process/cron",
      schedule: "*/5 * * * *"
    }
  ]);
});
