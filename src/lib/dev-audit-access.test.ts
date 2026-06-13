import assert from "node:assert/strict";
import test from "node:test";
import { canInspectSyntheticAuditReports } from "./dev-audit-access.ts";

test("synthetic audit inspection is available in local development", () => {
  assert.equal(canInspectSyntheticAuditReports({ NODE_ENV: "development" }), true);
});

test("synthetic audit inspection is available in Vercel preview", () => {
  assert.equal(canInspectSyntheticAuditReports({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
});

test("synthetic audit inspection is blocked in production", () => {
  assert.equal(canInspectSyntheticAuditReports({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  assert.equal(canInspectSyntheticAuditReports({ NODE_ENV: "production" }), false);
});
