import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  max_output_tokens: number;
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

const productGuidance = `You are TrainingTweaks, a running decision assistant for a self-coached runner.

Use the product doctrine, the user's stated context, and the training data to answer the current question.

The user already knows basic running concepts. Do not lecture them, recite data, or explain obvious training principles.

Default to a direct recommendation with the key reason. Ask a clarifying question only when the missing information would materially change the recommendation.

Keep the tone analytical, calm, and direct. No rah-rah coaching, guilt, or false certainty.

Do not provide medical advice, diagnose injuries, or tell the user to train through pain.`;

export async function askTrainingTweaks(
  activities: Activity[],
  trainingContext: TrainingContext,
  question: string
): Promise<TrainingTweaksModelCall> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const runningContext = toJsonValue(contextForPrompt(activities, trainingContext, question));
  const userContent = buildUserContent(trainingContext, question, runningContext);
  const openAIRequest: OpenAIRequestBody = {
    model,
    input: [
      { role: "system", content: productGuidance },
      { role: "user", content: userContent }
    ],
    max_output_tokens: 500,
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

function buildUserContent(
  trainingContext: TrainingContext,
  question: string,
  runningContext: unknown
) {
  return `PRODUCT DOCTRINE

${loadDoctrineDocs()}

USER SAYS

Question:
${question}

Selected plan family:
${trainingContext.planSource || "Not provided"}

Plan variant / level:
${trainingContext.planVariant?.trim() || "Not provided"}

Plan context:
${trainingContext.planContext?.trim() || "Not provided"}

Goals context:
${trainingContext.goalsContext?.trim() || "Not provided"}

Current subjective context:
${trainingContext.subjectiveContext?.trim() || "Not provided"}

TRAINING DATA

${JSON.stringify(runningContext, null, 2)}`;
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

function loadDoctrineDocs() {
  const paths = ["docs/runtime-doctrine.md"];
  const docs = paths
    .map((path) => {
      const fullPath = join(process.cwd(), path);
      if (!existsSync(fullPath)) return "";
      return readFileSync(fullPath, "utf8").trim();
    })
    .filter(Boolean);

  if (docs.length) return docs.join("\n\n---\n\n");

  return `TrainingTweaks is a decision product. Make the practical call, give the decisive reason briefly, and ask only for information that would materially change the recommendation.`;
}
