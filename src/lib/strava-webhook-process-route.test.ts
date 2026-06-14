import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  authorizeManualStravaWebhookProcess,
  parseStravaWebhookProcessLimit,
  stravaWebhookProcessDefaultLimit,
  stravaWebhookProcessMaxLimit,
  stravaWebhookProcessUnauthorizedError
} from "./strava-webhook-process-route.ts";

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
      providedSecret: "wrong-secret",
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

test("webhook processor unauthorized response is process-secret scoped", () => {
  assert.equal(stravaWebhookProcessUnauthorizedError, "Invalid Strava webhook process secret.");
  assert.notEqual(stravaWebhookProcessUnauthorizedError, "Login required.");
});

test("GitHub Actions workflow schedules the protected Strava webhook processor", async () => {
  const workflow = await readFile(".github/workflows/process-strava-webhooks.yml", "utf8");

  assert.match(workflow, /cron: "2-57\/5 \* \* \* \*"/);
  assert.match(workflow, /const appOrigin = new URL\(appUrl\)/);
  assert.match(workflow, /appOrigin\.pathname !== "\/"/);
  assert.match(workflow, /appOrigin\.search/);
  assert.match(workflow, /appOrigin\.hash/);
  assert.match(workflow, /new URL\("\/api\/strava\/webhook\/process", appOrigin\.origin\)/);
  assert.match(workflow, /url\.searchParams\.set\("limit", "25"\)/);
  assert.match(workflow, /url\.searchParams\.set\("x-vercel-protection-bypass", vercelBypassSecret\)/);
  assert.match(workflow, /method: "POST"/);
  assert.match(workflow, /\$\{\{ secrets\.STRAVA_WEBHOOK_PROCESS_SECRET \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.match(workflow, /\$\{\{ vars\.TRAININGTWEAKS_APP_URL \}\}/);
  assert.match(workflow, /"x-trainingtweaks-process-secret": secret/);
  assert.doesNotMatch(workflow, /\/api\/strava\/refresh/);
  assert.doesNotMatch(workflow, /\/api\/state/);
  assert.doesNotMatch(workflow, /console\.(?:log|error)\(url\)/);
  assert.doesNotMatch(workflow, /console\.(?:log|error)\(url\.toString\(\)\)/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
});

test("Vercel cron config is not present", async () => {
  await assert.rejects(access("vercel.json"));
});
