import { getOptionalEnv, getRequiredEnv } from "./env";
import { contextForPrompt } from "./summary";
import type { Activity, JsonValue, TrainingContext } from "./types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type OpenAIRequestBody = {
  model: string;
  input: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
};

export type TrainingTweaksModelCall = {
  model: string;
  runningContext: JsonValue;
  openAIRequest: OpenAIRequestBody;
  rawModelResponse: JsonValue;
  answer: string;
};

export class TrainingTweaksModelError extends Error {
  status?: number;
  model?: string;
  runningContext?: JsonValue;
  openAIRequest?: OpenAIRequestBody;
  rawModelResponse?: JsonValue | string;

  constructor(
    message: string,
    details: {
      status?: number;
      model?: string;
      runningContext?: JsonValue;
      openAIRequest?: OpenAIRequestBody;
      rawModelResponse?: JsonValue | string;
    } = {}
  ) {
    super(message);
    this.name = "TrainingTweaksModelError";
    this.status = details.status;
    this.model = details.model;
    this.runningContext = details.runningContext;
    this.openAIRequest = details.openAIRequest;
    this.rawModelResponse = details.rawModelResponse;
  }
}

const systemPrompt = `You are TrainingTweaks, a chat-first running decision assistant for a self-coached runner.

The user already has a training plan. Do not create a full plan. Help them adapt the existing plan using recent activity data, goals, constraints, and current subjective context.

Principles:
- The user decides. You are a decision-support assistant, not a coach.
- Prefer adaptation over rigid adherence. Do not imply missed workouts must be made up.
- Explain uncertainty and tradeoffs plainly.
- Use an analytical, low-drama tone. No rah-rah motivation, guilt, or fake certainty.
- Do not provide medical advice, diagnose injuries, or tell the user to train through pain.

Use judgment about response shape. Do not force a fixed template.

For training adaptation questions, usually include:
- a clear practical recommendation or short set of reasonable options
- the training logic behind it
- relevant tradeoffs
- risk flags such as injury, fatigue, load spike, heat, or schedule compression
- a confidence level when useful
- what the user should watch during or after the run

Write naturally and concisely. Use headings or bullets only when they make the answer easier to scan. When there is no obviously correct answer, say so and explain the decision points. If the user has not provided enough information for a recommendation, ask one or two specific questions or give conditional options rather than pretending certainty.

If the user is asking a clarifying, product, setup, context-entry, planning, or meta question, answer that question directly without training-advice scaffolding.`;

export async function askTrainingTweaks(
  activities: Activity[],
  trainingContext: TrainingContext,
  question: string
): Promise<TrainingTweaksModelCall> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const runningContext = toJsonValue(contextForPrompt(activities, trainingContext, question));
  const openAIRequest: OpenAIRequestBody = {
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
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(openAIRequest)
    });
  } catch (error) {
    throw new TrainingTweaksModelError(
      error instanceof Error ? error.message : "OpenAI request failed before a response was returned.",
      {
        model,
        runningContext,
        openAIRequest
      }
    );
  }

  if (!response.ok) {
    const rawResponse = await response.text();
    throw new TrainingTweaksModelError(`OpenAI request failed: ${response.status} ${rawResponse}`, {
      status: response.status,
      model,
      runningContext,
      openAIRequest,
      rawModelResponse: rawResponse
    });
  }

  const payload = (await response.json()) as OpenAIResponse;
  try {
    return {
      model,
      runningContext,
      openAIRequest,
      rawModelResponse: toJsonValue(payload),
      answer: extractText(payload)
    };
  } catch (error) {
    throw new TrainingTweaksModelError(
      error instanceof Error ? error.message : "OpenAI response could not be rendered.",
      {
        model,
        runningContext,
        openAIRequest,
        rawModelResponse: toJsonValue(payload)
      }
    );
  }
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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
