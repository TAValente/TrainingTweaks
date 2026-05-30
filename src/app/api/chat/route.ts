import { NextRequest, NextResponse } from "next/server";
import { askTrainingTweaks } from "@/lib/ai";
import { getData, saveContext } from "@/lib/store";
import type { TrainingContext } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TrainingContext & { question?: string };
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const context: TrainingContext = {
      planContext: body.planContext?.trim(),
      goalsContext: body.goalsContext?.trim(),
      subjectiveContext: body.subjectiveContext?.trim()
    };

    await saveContext(context);
    const data = await getData();
    const answer = await askTrainingTweaks(data.activities, context, question);

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
