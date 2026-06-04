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

type DecisionPayload = {
  recommendation?: string;
  reason?: string;
  caveat?: string;
};

const productGuidance = `You are TrainingTweaks, a practical running decision assistant for a self-coached runner.

The user already has a training plan. Help them adapt it without overreacting to one bad day or blindly trying to make up missed work.

Keep the tone analytical, calm, and direct. No rah-rah coaching, guilt, or false certainty.

Return a compact JSON decision. Do not write Markdown, section headings, option lists, or explanatory training-plan boilerplate.

Schedule reasoning is critical. Anchor advice to the provided calendar context, including today's local date/day, the last run date, and recent run days. Preserve user-stated event durations and schedule constraints; do not collapse a multi-day event into a one-day constraint. Do not assign a date or day to an event unless the user provided it or it is explicit in context. If the timing is ambiguous enough to change the recommendation, ask one concise clarifying question instead of assuming.

Training load and rest are more important than checking off every planned run. Before recommending, evaluate whether the proposed schedule compresses mileage, stacks runs too tightly, or creates too few rest/easy days after recent volume or a long run. Recovery runs are optional support, not key workouts; do not recommend adding a recovery run when rest would better protect the long run or reduce load risk.

When there are real tradeoffs, make the call. Mention an alternative only if the condition that would change the call is clear. Do not hide behind "either option is reasonable" unless the options are truly equivalent or key timing information is missing.

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
      max_output_tokens: 240,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  return formatDecision(extractText(payload));
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

Use calendarContext before making scheduling recommendations. First reconcile the timingSnapshot, today's local day/date, the last run, recent mileage, recent long runs, the current training week, planned workout days, and upcoming constraints. If the user says an event lasts multiple days, treat the full duration as a constraint. If the event date or duration is not provided, say that rather than inventing one.

Decision priority for schedule questions:
1. Avoid unsafe or counterproductive load compression.
2. Protect the quality and recovery around the long run or key workout.
3. Fit optional recovery mileage only if it does not compromise rest, logistics, or the key workout.
4. Preserve consistency when the above are satisfied.

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
- calendar context: today's local date/day, timezone, last run, recent run day names, days ago
- mileage windows: 7d, 14d, 28d, 6w, 12w, 6mo, 2y, 5y
- run counts over similar windows
- longest runs over recent and historical windows
- recent run details: date, distance, moving time, pace, heart rate, cadence, relative effort
- fastest known efforts by distance across 6 months, 2 years, and 5 years
- recent intensity indicators from heart rate, relative effort, workout/race naming, or other available signals

If a useful metric is missing, say so briefly rather than inventing it.

Structured data:
${JSON.stringify(runningContext, null, 2)}

RESPONSE REQUIREMENTS

Return ONLY valid JSON with this shape:
{
  "recommendation": "One sentence with the call. If the right move is to rest or skip optional mileage, say that directly.",
  "reason": "One sentence with the decisive training reason. Focus on load, rest, timing, or schedule risk; do not explain basic concepts like what long runs are for.",
  "caveat": "Optional one sentence naming the condition that would change the call. Use an empty string if not needed."
}

Rules:
- Do not say the user ran today unless calendarContext.lastRun.relativeToToday is "today".
- Do not invent dates for vague events.
- Do not provide Option 1 / Option 2.
- Do not include Markdown, bullets, labels, headings, confidence, risk flags, summaries, or what-to-watch sections.
- Do not repeat mileage, HR, effort, or plan facts unless they directly justify the recommendation.`;
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

function formatDecision(text: string) {
  const parsed = parseDecision(text);
  if (!parsed) return compactFallback(text);

  const recommendation = cleanDecisionPart(parsed.recommendation);
  const reason = cleanDecisionPart(parsed.reason);
  const caveat = cleanDecisionPart(parsed.caveat);
  const answer = [recommendation, [reason, caveat].filter(Boolean).join(" ")].filter(Boolean).join("\n\n");

  return answer || compactFallback(text);
}

function parseDecision(text: string): DecisionPayload | undefined {
  try {
    return JSON.parse(text) as DecisionPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as DecisionPayload;
    } catch {
      return undefined;
    }
  }
}

function cleanDecisionPart(value?: string) {
  return value
    ?.replace(/\s+/g, " ")
    .replace(/^[-*\d.\s]+/, "")
    .trim()
    .slice(0, 320);
}

function compactFallback(text: string) {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .split(/\n{2,}/)
    .slice(0, 2)
    .join("\n\n")
    .slice(0, 700)
    .trim();
}
