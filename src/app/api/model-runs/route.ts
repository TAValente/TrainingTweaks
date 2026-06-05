import { NextRequest, NextResponse } from "next/server";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { redactModelRuns } from "@/lib/model-runs";
import { getData, updateModelRunFeedback } from "@/lib/store";
import type { ModelRunFeedback } from "@/lib/types";

export const runtime = "nodejs";

const defaultLimit = 25;
const maxLimit = 100;

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
    if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const data = await getData(user.id);
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
    if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      note?: string;
      rating?: ModelRunFeedback["rating"];
    };

    if (!body.id) return NextResponse.json({ error: "Model run id is required." }, { status: 400 });
    if (body.rating !== "positive" && body.rating !== "negative") {
      return NextResponse.json({ error: "Feedback rating must be positive or negative." }, { status: 400 });
    }

    const feedback: ModelRunFeedback = {
      rating: body.rating,
      note: body.note?.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    const modelRun = await updateModelRunFeedback(user.id, body.id, feedback);

    if (!modelRun) return NextResponse.json({ error: "Model run was not found." }, { status: 404 });
    return NextResponse.json({ feedback: modelRun.feedback, verified: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save model run feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseLimit(value: string | null) {
  if (!value) return defaultLimit;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.min(Math.max(parsed, 1), maxLimit);
}
