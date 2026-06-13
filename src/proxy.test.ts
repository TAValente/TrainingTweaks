import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./lib/public-paths.ts";

test("synthetic audit inspection route bypasses auth proxy only in local development", () => {
  assert.equal(isPublicPath("/dev/audit-scenarios", { NODE_ENV: "development" }), true);
  assert.equal(isPublicPath("/dev/audit-scenarios", { NODE_ENV: "production" }), false);
  assert.equal(isPublicPath("/dev/audit-scenarios", { NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
});

test("ordinary app pages remain protected by auth proxy", () => {
  assert.equal(isPublicPath("/", { NODE_ENV: "development" }), false);
  assert.equal(isPublicPath("/model-runs", { NODE_ENV: "development" }), false);
});
