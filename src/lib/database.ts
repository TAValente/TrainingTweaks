import type { PoolConfig } from "pg";
import { getOptionalEnv } from "./env";

export type DatabasePublicConfig = {
  source: "parts" | "url" | "none";
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  hasPassword: boolean;
};

export function getDatabasePoolConfig(): PoolConfig | undefined {
  const host = getOptionalEnv("POSTGRES_HOST")?.trim();
  const user = getOptionalEnv("POSTGRES_USER")?.trim();
  const password = getOptionalEnv("POSTGRES_PASSWORD")?.trim();

  if (host && user && password) {
    return withSslIfSupabase({
      host,
      user,
      password,
      port: Number(getOptionalEnv("POSTGRES_PORT") || "5432"),
      database: getOptionalEnv("POSTGRES_DATABASE") || "postgres"
    });
  }

  const connectionString = getOptionalEnv("DATABASE_URL")?.trim();
  if (!connectionString) return undefined;

  return withSslIfSupabase({ connectionString });
}

export function getDatabasePublicConfig(): DatabasePublicConfig {
  const host = getOptionalEnv("POSTGRES_HOST")?.trim();
  const user = getOptionalEnv("POSTGRES_USER")?.trim();
  const password = getOptionalEnv("POSTGRES_PASSWORD")?.trim();

  if (host || user || password) {
    return {
      source: "parts",
      host,
      port: getOptionalEnv("POSTGRES_PORT") || "5432",
      database: getOptionalEnv("POSTGRES_DATABASE") || "postgres",
      user,
      hasPassword: Boolean(password)
    };
  }

  const connectionString = getOptionalEnv("DATABASE_URL")?.trim();
  if (!connectionString) return { source: "none", hasPassword: false };

  try {
    const parsed = new URL(connectionString);
    return {
      source: "url",
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      user: parsed.username,
      hasPassword: Boolean(parsed.password)
    };
  } catch {
    return { source: "url", hasPassword: false };
  }
}

function withSslIfSupabase(config: PoolConfig): PoolConfig {
  const host =
    config.host ??
    (typeof config.connectionString === "string"
      ? safeParseHost(config.connectionString)
      : undefined);

  if (host?.includes("supabase.com")) {
    return { ...config, ssl: { rejectUnauthorized: false } };
  }

  return config;
}

function safeParseHost(connectionString: string) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
}
