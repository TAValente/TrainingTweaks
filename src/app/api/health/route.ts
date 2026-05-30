import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getDatabasePoolConfig, getDatabasePublicConfig } from "@/lib/database";
import { getOptionalEnv } from "@/lib/env";
import { getBaseUrl, getStravaRedirectUri } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET() {
  const databaseConfig = getDatabasePoolConfig();
  const checks = {
    appBaseUrl: getBaseUrl(),
    stravaRedirectUri: getStravaRedirectUri(),
    hasStravaClientId: Boolean(getOptionalEnv("STRAVA_CLIENT_ID")),
    hasStravaClientSecret: Boolean(getOptionalEnv("STRAVA_CLIENT_SECRET")),
    hasOpenAiKey: Boolean(getOptionalEnv("OPENAI_API_KEY")),
    hasDatabaseConfig: Boolean(databaseConfig),
    databaseConfig: getDatabasePublicConfig(),
    database: await checkDatabase(databaseConfig)
  };

  return NextResponse.json(checks);
}

async function checkDatabase(config?: ReturnType<typeof getDatabasePoolConfig>) {
  if (!config) {
    return { ok: false, message: "Database connection is not configured." };
  }

  const pool = new Pool({ ...config, connectionTimeoutMillis: 5000 });

  try {
    await pool.query("select 1");
    return { ok: true, message: "Database connection succeeded." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed.";
    return { ok: false, message: safeDatabaseMessage(message) };
  } finally {
    await pool.end();
  }
}

function safeDatabaseMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("password")) return "Database authentication failed. Check the password in DATABASE_URL.";
  if (lower.includes("enotfound")) return "Database host could not be reached. Check the host in DATABASE_URL.";
  if (lower.includes("timeout")) return "Database connection timed out. Use the Supabase session pooler URL.";
  if (lower.includes("network")) return "Database network connection failed. Use the Supabase session pooler URL.";
  if (lower.includes("tenant or user not found")) return "Supabase pooler user/tenant was not found. Check the session pooler username.";
  return "Database connection failed. Check that DATABASE_URL is the Supabase session pooler string.";
}
