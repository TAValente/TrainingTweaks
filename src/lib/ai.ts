import { getOptionalEnv, getRequiredEnv } from "./env";
import { contextForPrompt } from "./summary";
import { getTrainingPlanProfile, planKnowledgeGuide } from "./training-plans";
import type { Activity, TrainingContext } from "./types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

const productGuidance = `You are TrainingTweaks, a practical running decision assistant for a self-coached runner.

The user already has a training plan. Help them adapt it without overreacting to one bad day or blindly trying to make up missed work.

Keep the tone analytical, calm, and direct. No rah-rah coaching, guilt, or false certainty.

Answer naturally. A simple question can get a simple answer. When there are real tradeoffs, name the best option and the main alternative.

You can discuss pain, soreness, symptoms, injury risk, and conservative training adjustments. Do not claim to diagnose a medical condition. When symptoms sound acute, worsening, unusual, or risky, say that training advice is uncertain and suggest getting medical/professional input.

Do not create a full training plan unless explicitly asked.

The user makes the final decision.`;

export async function askTrainingTweaks(
  activities: Activity[],
  trainingContext: TrainingContext,
  question: string
) {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const runningContext = contextForPrompt(activities, trainingContext, question);
  const userContent = buildUserContent(trainingContext, question, runningContext);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: productGuidance },
        { role: "user", content: userContent }
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

function buildUserContent(
  trainingContext: TrainingContext,
  question: string,
  runningContext: unknown
) {
  const selectedPlan = getTrainingPlanProfile(trainingContext.planSource);
  return `USER INPUTS

Current question:
${question}

Selected training plan:
${selectedPlan.label}

Plan variant / level:
${trainingContext.planVariant?.trim() || "Not provided"}

Plan context:
${trainingContext.planContext?.trim() || "Not provided"}

Goals context:
${trainingContext.goalsContext?.trim() || "Not provided"}

Current subjective context:
${trainingContext.subjectiveContext?.trim() || "Not provided"}

AVAILABLE DATA

You have access to recent and historical Strava-derived running data. Use whatever is relevant to answer the user's question; ignore what is not relevant. Do not recite the data back unless it supports the reasoning.

The user may select a named training plan family. Use the selected plan profile as helpful background, but the user's pasted plan details and recent training data are more important than generic plan knowledge.

Use plan context in this priority order:
1. The user's actual pasted plan/week details.
2. The selected plan variant or level, if provided.
3. The selected plan family's philosophy, stress pattern, and adaptation bias.
4. General running adaptation principles.

Do not assume a plan variant's exact workout schedule unless it is provided. Use plan-family knowledge to infer intent, not exact prescriptions.

Selected plan guide:
${planKnowledgeGuide(trainingContext.planSource)}

Available fields may include:
- mileage windows: 7d, 14d, 28d, 6w, 12w, 6mo, 2y, 5y
- run counts over similar windows
- longest runs over recent and historical windows
- recent run details: date, distance, moving time, pace, heart rate, cadence, relative effort
- fastest known efforts by distance across 6 months, 2 years, and 5 years
- recent intensity indicators from heart rate, relative effort, workout/race naming, or other available signals

If a useful metric is missing, say so briefly rather than inventing it.

Structured data:
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
