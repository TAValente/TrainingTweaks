import { isStravaWebhookProcessAuthorized } from "./strava-webhook-processor.ts";

export const stravaWebhookProcessDefaultLimit = 25;
export const stravaWebhookProcessMaxLimit = 100;
export const stravaWebhookProcessSecretHeader = "x-trainingtweaks-process-secret";
export const vercelCronUserAgent = "vercel-cron/1.0";

export type StravaWebhookProcessSource = "manual" | "cron";

export function parseStravaWebhookProcessLimit(value: string | null | undefined) {
  if (!value) return stravaWebhookProcessDefaultLimit;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return stravaWebhookProcessDefaultLimit;
  return Math.min(Math.floor(parsed), stravaWebhookProcessMaxLimit);
}

export function isVercelCronRequest(userAgent: string | null | undefined) {
  return userAgent?.trim() === vercelCronUserAgent;
}

export function authorizeManualStravaWebhookProcess(input: {
  providedSecret: string | null | undefined;
  expectedSecret: string | undefined;
}) {
  return isStravaWebhookProcessAuthorized(input.providedSecret, input.expectedSecret);
}

export function authorizeCronStravaWebhookProcess(input: {
  userAgent: string | null | undefined;
  providedSecret: string | null | undefined;
  expectedSecret: string | undefined;
}) {
  return (
    isVercelCronRequest(input.userAgent) ||
    isStravaWebhookProcessAuthorized(input.providedSecret, input.expectedSecret)
  );
}
