import { NextRequest, NextResponse } from "next/server";
import { redactModelRuns } from "@/lib/model-runs";
import { getData } from "@/lib/store";

export const runtime = "nodejs";

const defaultLimit = 25;
const maxLimit = 100;

export async function GET(request: NextRequest) {
  try {
    const data = await getData();
    const modelRuns = redactModelRuns(data.modelRuns ?? []);
    const exportAll = request.nextUrl.searchParams.get("export") === "json";
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const selectedRuns = exportAll ? modelRuns : modelRuns.slice(-limit).reverse();

    const response = NextResponse.json({
      count: selectedRuns.length,
      totalRetained: modelRuns.length,
      modelRuns: selectedRuns
    });

    if (exportAll) {
      response.headers.set("content-disposition", "attachment; filename=trainingtweaks-model-runs.json");
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load model runs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseLimit(value: string | null) {
  if (!value) return defaultLimit;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.min(Math.max(parsed, 1), maxLimit);
}
