import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { askTrainingTweaks, TrainingTweaksModelError } from "@/lib/ai";
import { authCookieName, getRequestUser } from "@/lib/auth";
import { appendModelRun, getData, saveContext } from "@/lib/store";
import type { StoredModelRun, TrainingContext } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let question = "";
  let context: TrainingContext | undefined;
  let shouldLogModelRun = false;
  let userId: string | undefined;

  try {
    const user = await getRequestUser(request.cookies.get(authCookieName)?.value);
    if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
    userId = user.id;

    const body = (await request.json()) as TrainingContext & { question?: string };
    question = body.question?.trim() ?? "";

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    context = {
      planSource: body.planSource,
      planVariant: body.planVariant?.trim(),
      planContext: body.planContext?.trim(),
      goalsContext: body.goalsContext?.trim(),
      subjectiveContext: body.subjectiveContext?.trim()
    };

    await saveContext(user.id, context);
    const data = await getData(user.id);
    shouldLogModelRun = true;
    const modelCall = await askTrainingTweaks(data.activities, context, question);
    const modelRunId = randomUUID();

    const persistedModelRun = await safeAppendModelRun(user.id, {
      id: modelRunId,
      timestamp: new Date().toISOString(),
      question,
      trainingContext: context,
      runningContext: modelCall.runningContext,
      model: modelCall.model,
      openAIRequest: modelCall.openAIRequest,
      rawModelResponse: modelCall.rawModelResponse,
      renderedAnswer: modelCall.answer
    });

    return NextResponse.json({
      answer: modelCall.answer,
      modelRunId: persistedModelRun ? modelRunId : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    if (shouldLogModelRun && question && context && userId) {
      const modelError = error instanceof TrainingTweaksModelError ? error : undefined;
      await safeAppendModelRun(userId, {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        question,
        trainingContext: context,
        runningContext: modelError?.runningContext,
        model: modelError?.model,
        openAIRequest: modelError?.openAIRequest,
        rawModelResponse: modelError?.rawModelResponse,
        error: {
          message,
          status: modelError?.status,
          rawResponse: modelError?.rawModelResponse
        }
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function safeAppendModelRun(userId: string, modelRun: StoredModelRun) {
  try {
    await appendModelRun(userId, modelRun);
    return true;
  } catch (error) {
    console.error("Could not persist model run.", error);
    return false;
  }
}
