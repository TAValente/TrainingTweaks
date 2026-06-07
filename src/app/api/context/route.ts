import { NextRequest, NextResponse } from "next/server";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { getData, saveContext } from "@/lib/store";
import type { TrainingContext } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = (await request.json()) as TrainingContext;
  const current = await getData(user.id);
  const context: TrainingContext = {
    planSource: body.planSource ?? current.context?.planSource,
    planVariant: body.planVariant?.trim(),
    planContext: body.planContext?.trim(),
    structuredPlan: body.structuredPlan,
    goalsContext: body.goalsContext?.trim(),
    subjectiveContext: body.subjectiveContext?.trim() ?? current.context?.subjectiveContext
  };

  await saveContext(user.id, context);
  return NextResponse.json({ context });
}
