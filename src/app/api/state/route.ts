import { NextResponse } from "next/server";
import { getData } from "@/lib/store";
import { buildActivitySummary } from "@/lib/summary";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getData();
    return NextResponse.json({
      connected: Boolean(data.strava),
      lastRefreshAt: data.lastRefreshAt,
      activities: data.activities.slice(0, 20),
      context: data.context,
      summary: buildActivitySummary(data.activities)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load app state.";
    return NextResponse.json(
      { error: deploymentSafeError(message) },
      { status: 500 }
    );
  }
}

function deploymentSafeError(message: string) {
  if (message.includes("DATABASE_URL")) return "DATABASE_URL is missing or invalid.";
  if (message.toLowerCase().includes("password")) return "Database authentication failed. Check DATABASE_URL password.";
  if (message.toLowerCase().includes("enotfound")) return "Database host could not be reached. Check DATABASE_URL host.";
  if (message.toLowerCase().includes("timeout")) return "Database connection timed out. Use the Supabase session pooler URL.";
  if (message.toLowerCase().includes("network")) return "Database network connection failed. Use the Supabase session pooler URL.";
  return "Could not connect to the configured database.";
}
