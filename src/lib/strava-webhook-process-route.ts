import { isStravaWebhookProcessAuthorized } from "./strava-webhook-processor.ts";

export const stravaWebhookProcessDefaultLimit = 25;
export const stravaWebhookProcessMaxLimit = 100;
export const stravaWebhookProcessSecretHeader = "x-trainingtweaks-process-secret";

export type StravaWebhookProcessSource = "manual";

export function parseStravaWebhookProcessLimit(value: string | null | undefined) {
  if (!value) return stravaWebhookProcessDefaultLimit;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return stravaWebhookProcessDefaultLimit;
  return Math.min(Math.floor(parsed), stravaWebhookProcessMaxLimit);
}

export function authorizeManualStravaWebhookProcess(input: {
  providedSecret: string | null | undefined;
  expectedSecret: string | undefined;
}) {
  return isStravaWebhookProcessAuthorized(input.providedSecret, input.expectedSecret);
}
