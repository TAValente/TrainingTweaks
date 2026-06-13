export function canInspectSyntheticAuditReports(
  env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "VERCEL_ENV">> = process.env
) {
  return env.NODE_ENV === "development" || env.VERCEL_ENV === "preview";
}
