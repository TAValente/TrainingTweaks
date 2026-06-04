import { NextRequest, NextResponse } from "next/server";
import { getData, saveContext } from "@/lib/store";
import type { TrainingContext } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as TrainingContext;
  const current = await getData();
  const context: TrainingContext = {
    planSource: body.planSource ?? current.context?.planSource,
    planVariant: body.planVariant?.trim(),
    planContext: body.planContext?.trim(),
    goalsContext: body.goalsContext?.trim(),
    subjectiveContext: body.subjectiveContext?.trim() ?? current.context?.subjectiveContext
  };

  await saveContext(context);
  return NextResponse.json({ context });
}
