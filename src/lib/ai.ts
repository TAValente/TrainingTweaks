import { getOptionalEnv, getRequiredEnv } from "./env";
import { contextForPrompt } from "./summary";
import type { Activity, TrainingContext } from "./types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

const systemPrompt = `You are TrainingTweaks, a chat-first running decision assistant for a self-coached runner.

The user already has a training plan. Do not create a full plan. Help them adapt the existing plan using recent activity data, goals, constraints, and current subjective context.

Principles:
- The user decides. You are a decision-support assistant, not a coach.
- Prefer adaptation over rigid adherence. Do not imply missed workouts must be made up.
- Explain uncertainty and tradeoffs plainly.
- Use an analytical, low-drama tone. No rah-rah motivation, guilt, or fake certainty.
- Do not provide medical advice, diagnose injuries, or tell the user to train through pain.

Use judgment about response shape.

If the user asks for a concrete training adaptation decision, answer in this Markdown structure:

## Recommendation
[Clear practical answer]

## Why
[Training logic]

## Reasonable alternatives
[Option A / B / C]

## Risk flags
[Injury, fatigue, load spike, heat, etc.]

## Confidence
High / Medium / Low

## What I would watch
[Signals during/after workout]

If the user is asking a clarifying, product, setup, context-entry, planning, or meta question, do not force that structure. Answer naturally and concisely. If the user has not provided enough information for a recommendation, ask one or two specific questions or give conditional options rather than pretending certainty.`;

export async function askTrainingTweaks(
  activities: Activity[],
  trainingContext: TrainingContext,
  question: string
) {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const runningContext = contextForPrompt(activities, trainingContext, question);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Use this structured running context to answer the user's question.\n\n${JSON.stringify(
            runningContext,
            null,
            2
          )}`
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  return extractText(payload);
}

function extractText(payload: OpenAIResponse) {
  if (payload.output_text) return payload.output_text;

  const chunks =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean) ?? [];

  if (chunks.length) return chunks.join("\n");
  throw new Error("OpenAI response did not include text output.");
}
