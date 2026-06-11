import type { ActivePlanSnapshot } from "./active-plan-snapshot";

export function activePlanGuidanceForPrompt(runningContext: unknown) {
  const snapshot = activePlanSnapshotFromRunningContext(runningContext);
  if (!snapshot || snapshot.status === "no_plan") {
    return `ACTIVE PLAN OPERATING GUIDANCE

No accepted active plan is available. Do not invent planned mileage or a plan workout. Use the user's context, recent training data, and risk findings to make the recommendation.

${conversationalGuidance()}`;
  }

  if (snapshot.status === "before_plan") {
    return `ACTIVE PLAN OPERATING GUIDANCE

Accepted active plan snapshot:
${JSON.stringify(snapshot, null, 2)}

The accepted active plan exists, but it has not started yet. Mention it only as future context. Do not treat plannedToday as today's recommendation.

${conversationalGuidance()}`;
  }

  if (snapshot.status === "after_plan") {
    return `ACTIVE PLAN OPERATING GUIDANCE

Accepted active plan snapshot:
${JSON.stringify(snapshot, null, 2)}

The accepted active plan has ended. Do not anchor today's recommendation to the ended plan.

${conversationalGuidance()}`;
  }

  if (snapshot.status === "invalid_plan") {
    return `ACTIVE PLAN OPERATING GUIDANCE

Accepted active plan snapshot:
${JSON.stringify(snapshot, null, 2)}

The accepted active plan is unusable because its date, duration, or current-week data is invalid. Do not anchor today's recommendation to the invalid plan.

${conversationalGuidance()}`;
  }

  return `ACTIVE PLAN OPERATING GUIDANCE

Accepted active plan snapshot:
${JSON.stringify(snapshot, null, 2)}

Use the accepted active plan as the default anchor for the recommendation. Treat plannedToday as the starting point, not as passive metadata.

If plannedToday is rest, rest is a real planned workout recommendation, not missing plan data.

Use activePlanSnapshot.deviation.status to interpret the week:
- on_track: preserve the planned workout unless risk, pain, recovery, schedule, or user context justifies a change.
- ahead: be cautious about adding mileage or intensity; avoid turning extra completed work into permission to do more.
- behind: do not automatically prescribe catch-up mileage; preserve the plan structure unless there is a clearly low-risk adjustment.
- unknown: acknowledge uncertainty through the recommendation, but still start from plannedToday when the plan is in progress.

Deviate from the accepted plan only when risk, pain, recovery, schedule, or user context justifies it. When deviating, explain the tradeoff plainly.

Do not mutate the plan, create decision records, or invent Runner Doctrine.

${conversationalGuidance()}`;
}

function activePlanSnapshotFromRunningContext(runningContext: unknown): ActivePlanSnapshot | undefined {
  if (!runningContext || typeof runningContext !== "object") return undefined;
  return (runningContext as { activePlanSnapshot?: ActivePlanSnapshot }).activePlanSnapshot;
}

function conversationalGuidance() {
  return `Keep the answer conversational and direct. Do not use a rigid visible template such as "Planned workout / Current status / Recommendation / Why."`;
}
