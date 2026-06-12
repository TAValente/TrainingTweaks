import type {
  ActualFulfillment,
  Activity,
  RecommendationFulfillmentTrace,
  RecommendationIntent,
  StoredModelRun
} from "./types.ts";

const metersPerMile = 1609.344;

export type FulfillmentMatchResult = {
  actualFulfillment: ActualFulfillment;
  actualExposure?: {
    activityIds?: string[];
    miles?: number;
    durationMinutes?: number;
    intensity?: "off" | "easy" | "moderate" | "hard" | "unknown";
    completedAt?: string;
    notes?: string;
  };
  confidence: "low" | "medium" | "high";
  rationale: string;
};

type ActualExposureSummary = NonNullable<FulfillmentMatchResult["actualExposure"]>;
type ActualExposureIntensity = NonNullable<ActualExposureSummary["intensity"]>;

type MatchInput = {
  trace: RecommendationFulfillmentTrace;
  activities: Activity[];
  asOfDate?: Date;
};

const defaultToleranceDays: Record<RecommendationIntent, number | undefined> = {
  long_run: 6,
  easy_run: 1,
  recovery_run: 1,
  workout: 1,
  rest: 1,
  cross_train: 1,
  delay_decision: undefined,
  adjust_week: undefined,
  unknown: undefined
};

export function matchRecommendationFulfillment({
  trace,
  activities,
  asOfDate = new Date()
}: MatchInput): FulfillmentMatchResult {
  if (trace.targetIntent === "unknown") {
    return unknown("Trace targetIntent is unknown; v1 does not guess recommendation intent.");
  }

  if (trace.targetIntent === "delay_decision" || trace.targetIntent === "adjust_week") {
    return unknown(`${trace.targetIntent} does not have enough deterministic structure for v1 matching.`);
  }

  if (trace.targetIntent === "rest") {
    return matchRest(trace, activities, asOfDate);
  }

  if (
    (trace.targetIntent === "long_run" ||
      trace.targetIntent === "easy_run" ||
      trace.targetIntent === "recovery_run") &&
    !hasRunAlignmentStructure(trace)
  ) {
    return unknown(`Trace targetIntent is ${trace.targetIntent}, but it lacks enough exposure or explicit matching structure.`);
  }

  const candidates = laterActivities(trace, activities)
    .filter((activity) => isRun(activity))
    .filter((activity) => isWithinTolerance(trace, activity.startDate));

  if (!candidates.length) {
    if (toleranceElapsed(trace, asOfDate)) {
      return {
        actualFulfillment: "skipped",
        confidence: "medium",
        rationale: "No matching run appeared after the recommendation within the schedule tolerance."
      };
    }

    return {
      actualFulfillment: "not_enough_data",
      confidence: "low",
      rationale: "No matching run has appeared yet, but the schedule tolerance has not fully elapsed."
    };
  }

  if (trace.targetIntent === "long_run") return matchLongRun(trace, candidates);
  if (trace.targetIntent === "easy_run" || trace.targetIntent === "recovery_run") {
    return matchEasyOrRecoveryRun(trace, candidates);
  }
  if (trace.targetIntent === "workout") return matchWorkout(trace, candidates);
  if (trace.targetIntent === "cross_train") return unknown("V1 does not yet match cross-training activities confidently.");

  return unknown("No deterministic matcher exists for this recommendation intent.");
}

export function updateStoredModelRunFulfillment(
  modelRun: StoredModelRun,
  result: FulfillmentMatchResult
): StoredModelRun {
  if (!modelRun.recommendationFulfillmentTrace) return modelRun;

  return {
    ...modelRun,
    recommendationFulfillmentTrace: {
      ...modelRun.recommendationFulfillmentTrace,
      actualFulfillment: result.actualFulfillment,
      actualExposure: result.actualExposure
    }
  };
}

function matchLongRun(trace: RecommendationFulfillmentTrace, candidates: Activity[]): FulfillmentMatchResult {
  if (!hasRunAlignmentStructure(trace)) {
    return unknown("Trace does not include enough exposure or explicit matching structure to classify long-run fulfillment.");
  }

  const best = candidates
    .map((activity) => ({
      activity,
      miles: miles(activity.distanceMeters),
      durationMinutes: durationMinutes(activity),
      intensity: intensityForActivity(activity)
    }))
    .sort((a, b) => b.miles - a.miles)[0];

  if (!best) return unknown("No long-run candidate was available.");

  if (clearlyExceededMax(trace, best.miles)) {
    return {
      actualFulfillment: "chose_opposite_side",
      actualExposure: exposureFor(best.activity, best.intensity, "Exceeded the recommendation's explicit maximum."),
      confidence: "medium",
      rationale: "The run clearly exceeded an explicit maximum that the trace marked as not aligned."
    };
  }

  if (withinExposureBounds(trace, best.miles, best.durationMinutes)) {
    return alignedResult(trace, best.activity, best.intensity, "Run matched the long-run intent and exposure bounds.");
  }

  if (nearExposureBounds(trace, best.miles, best.durationMinutes)) {
    return {
      actualFulfillment: "modified_but_aligned",
      actualExposure: exposureFor(best.activity, best.intensity, "Long-run intent was clear with moderate exposure variation."),
      confidence: "medium",
      rationale: "The run appears to preserve the long-run intent with acceptable/moderate exposure variation."
    };
  }

  return unknown("A run occurred within tolerance, but its exposure does not clearly match the long-run recommendation.");
}

function matchEasyOrRecoveryRun(trace: RecommendationFulfillmentTrace, candidates: Activity[]): FulfillmentMatchResult {
  if (!hasRunAlignmentStructure(trace)) {
    return unknown("Trace does not include enough exposure or explicit matching structure to classify easy/recovery fulfillment.");
  }

  const best = candidates
    .map((activity) => ({
      activity,
      miles: miles(activity.distanceMeters),
      durationMinutes: durationMinutes(activity),
      intensity: intensityForActivity(activity)
    }))
    .sort((a, b) => scoreEasyCandidate(trace, b) - scoreEasyCandidate(trace, a))[0];

  if (!best) return unknown("No easy/recovery candidate was available.");

  if (best.intensity === "hard" && trace.expectedExposure?.avoidIntensity && notAlignedMentionsIntensity(trace)) {
    return {
      actualFulfillment: "chose_opposite_side",
      actualExposure: exposureFor(best.activity, best.intensity, "Hard effort despite explicit avoid-intensity guidance."),
      confidence: "medium",
      rationale: "The run was clearly hard while the trace explicitly said to avoid intensity."
    };
  }

  if (
    (best.intensity === "easy" || best.intensity === "unknown") &&
    withinExposureBounds(trace, best.miles, best.durationMinutes)
  ) {
    return alignedResult(trace, best.activity, best.intensity, "Run matched the easy/recovery intent.");
  }

  return unknown("A run occurred within tolerance, but v1 cannot confidently classify it as aligned easy/recovery work.");
}

function matchWorkout(trace: RecommendationFulfillmentTrace, candidates: Activity[]): FulfillmentMatchResult {
  const workout = candidates.find((activity) => isHardActivity(activity));
  if (!workout) return unknown("No run clearly looked like a workout/tempo/interval/race effort.");

  return alignedResult(trace, workout, intensityForActivity(workout), "Run clearly matched workout intent.");
}

function matchRest(
  trace: RecommendationFulfillmentTrace,
  activities: Activity[],
  asOfDate: Date
): FulfillmentMatchResult {
  const candidates = laterActivities(trace, activities).filter((activity) => isWithinTolerance(trace, activity.startDate));
  const hard = candidates.find((activity) => isRun(activity) && isHardActivity(activity));
  if (hard) {
    return {
      actualFulfillment: "chose_opposite_side",
      actualExposure: exposureFor(hard, intensityForActivity(hard), "Hard run during a recommended rest tolerance."),
      confidence: "high",
      rationale: "A hard run occurred inside the rest recommendation's schedule tolerance."
    };
  }

  if (!toleranceElapsed(trace, asOfDate)) {
    return {
      actualFulfillment: "not_enough_data",
      confidence: "low",
      rationale: "Rest tolerance has not fully elapsed yet."
    };
  }

  const run = candidates.find((activity) => isRun(activity));
  if (run) {
    return unknown("A run occurred during rest tolerance, but it was not clearly hard enough to classify as chose_opposite_side.");
  }

  return {
    actualFulfillment: "fulfilled",
    actualExposure: {
      intensity: "off",
      notes: "No run or hard activity appeared within the rest schedule tolerance."
    },
    confidence: "medium",
    rationale: "No run or hard activity appeared after the rest recommendation within the elapsed tolerance."
  };
}

function alignedResult(
  trace: RecommendationFulfillmentTrace,
  activity: Activity,
  intensity: ActualExposureIntensity,
  notes: string
): FulfillmentMatchResult {
  const sameDay = localDate(activity.startDate) === localDate(trace.createdAt);

  return {
    actualFulfillment: sameDay ? "fulfilled" : "shifted_but_aligned",
    actualExposure: exposureFor(activity, intensity, notes),
    confidence: sameDay ? "high" : "medium",
    rationale: sameDay
      ? "The matching activity happened on the recommendation date and matched the intended workout."
      : "The matching activity preserved the intended workout inside the schedule tolerance on a different day."
  };
}

function exposureFor(
  activity: Activity,
  intensity: ActualExposureIntensity,
  notes: string
): ActualExposureSummary {
  return {
    activityIds: [`${activity.provider}:${activity.providerActivityId}`],
    miles: round1(miles(activity.distanceMeters)),
    durationMinutes: activity.movingTimeSeconds ? Math.round(activity.movingTimeSeconds / 60) : undefined,
    intensity,
    completedAt: activity.startDate,
    notes
  };
}

function laterActivities(trace: RecommendationFulfillmentTrace, activities: Activity[]) {
  const createdAt = new Date(trace.createdAt).getTime();
  return activities
    .filter((activity) => new Date(activity.startDate).getTime() >= createdAt)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function isWithinTolerance(trace: RecommendationFulfillmentTrace, activityDate: string) {
  return new Date(activityDate).getTime() <= toleranceEnd(trace).getTime();
}

function toleranceElapsed(trace: RecommendationFulfillmentTrace, asOfDate: Date) {
  return asOfDate.getTime() > toleranceEnd(trace).getTime();
}

function toleranceEnd(trace: RecommendationFulfillmentTrace) {
  if (trace.scheduleTolerance?.latestDate) {
    return endOfUtcDate(trace.scheduleTolerance.latestDate);
  }

  const days = toleranceDays(trace);
  if (days === undefined) return new Date(trace.createdAt);

  return endOfUtcDate(addUtcDays(localDate(trace.createdAt), days));
}

function toleranceDays(trace: RecommendationFulfillmentTrace) {
  switch (trace.scheduleTolerance?.type) {
    case "same_day":
      return 0;
    case "next_day":
      return 1;
    case "same_microcycle":
      return 3;
    case "same_training_week":
      return 6;
    case "flexible":
      return 14;
    case "unknown":
      return defaultToleranceDays[trace.targetIntent];
    default:
      return defaultToleranceDays[trace.targetIntent];
  }
}

function hasRunAlignmentStructure(trace: RecommendationFulfillmentTrace) {
  const expected = trace.expectedExposure;
  return Boolean(
    expected?.targetMiles !== undefined ||
      expected?.minMiles !== undefined ||
      expected?.maxMiles !== undefined ||
      expected?.durationMinutes !== undefined ||
      expected?.minDurationMinutes !== undefined ||
      expected?.maxDurationMinutes !== undefined ||
      expected?.notes?.trim() ||
      trace.acceptableSubstitutions?.some((item) => item.trim())
  );
}

function withinExposureBounds(
  trace: RecommendationFulfillmentTrace,
  actualMiles: number,
  actualDurationMinutes?: number
) {
  const expected = trace.expectedExposure;
  if (!expected) return Boolean(trace.acceptableSubstitutions?.length);

  if (expected.minMiles !== undefined && actualMiles < expected.minMiles) return false;
  if (expected.maxMiles !== undefined && actualMiles > expected.maxMiles) return false;
  if (expected.targetMiles !== undefined && expected.minMiles === undefined && expected.maxMiles === undefined) {
    return Math.abs(actualMiles - expected.targetMiles) <= Math.max(1, expected.targetMiles * 0.1);
  }
  if (
    expected.minDurationMinutes !== undefined &&
    (actualDurationMinutes === undefined || actualDurationMinutes < expected.minDurationMinutes)
  ) {
    return false;
  }
  if (
    expected.maxDurationMinutes !== undefined &&
    (actualDurationMinutes === undefined || actualDurationMinutes > expected.maxDurationMinutes)
  ) {
    return false;
  }
  if (
    expected.durationMinutes !== undefined &&
    expected.minDurationMinutes === undefined &&
    expected.maxDurationMinutes === undefined
  ) {
    if (actualDurationMinutes === undefined) return false;
    return Math.abs(actualDurationMinutes - expected.durationMinutes) <= Math.max(10, expected.durationMinutes * 0.1);
  }

  return true;
}

function nearExposureBounds(
  trace: RecommendationFulfillmentTrace,
  actualMiles: number,
  actualDurationMinutes?: number
) {
  const expected = trace.expectedExposure;
  if (!expected) return false;

  if (expected.targetMiles !== undefined) {
    return Math.abs(actualMiles - expected.targetMiles) <= Math.max(2, expected.targetMiles * 0.2);
  }

  if (expected.maxMiles !== undefined && actualMiles > expected.maxMiles) {
    return actualMiles <= expected.maxMiles + Math.max(1, expected.maxMiles * 0.15);
  }

  if (expected.minMiles !== undefined && actualMiles < expected.minMiles) {
    return actualMiles >= expected.minMiles - Math.max(1, expected.minMiles * 0.15);
  }
  if (expected.durationMinutes !== undefined && actualDurationMinutes !== undefined) {
    return Math.abs(actualDurationMinutes - expected.durationMinutes) <= Math.max(20, expected.durationMinutes * 0.2);
  }
  if (
    expected.maxDurationMinutes !== undefined &&
    actualDurationMinutes !== undefined &&
    actualDurationMinutes > expected.maxDurationMinutes
  ) {
    return actualDurationMinutes <= expected.maxDurationMinutes + Math.max(10, expected.maxDurationMinutes * 0.15);
  }
  if (
    expected.minDurationMinutes !== undefined &&
    actualDurationMinutes !== undefined &&
    actualDurationMinutes < expected.minDurationMinutes
  ) {
    return actualDurationMinutes >= expected.minDurationMinutes - Math.max(10, expected.minDurationMinutes * 0.15);
  }

  return false;
}

function clearlyExceededMax(trace: RecommendationFulfillmentTrace, actualMiles: number) {
  const maxMiles = trace.expectedExposure?.maxMiles;
  if (maxMiles === undefined || actualMiles <= maxMiles) return false;

  const notAligned = (trace.notAlignedIf ?? []).join(" ").toLowerCase();
  const roundedActual = Math.round(actualMiles).toString();
  const roundedMax = Math.round(maxMiles).toString();

  return notAligned.includes(roundedActual) || notAligned.includes(`over ${roundedMax}`) || notAligned.includes(`>${roundedMax}`);
}

function scoreEasyCandidate(
  trace: RecommendationFulfillmentTrace,
  candidate: { miles: number; durationMinutes?: number; intensity: ActualExposureIntensity }
) {
  const expectedMiles = trace.expectedExposure?.targetMiles ?? trace.expectedExposure?.maxMiles ?? 0;
  const expectedDuration = trace.expectedExposure?.durationMinutes ?? trace.expectedExposure?.maxDurationMinutes ?? 0;
  const exposureScore = expectedMiles
    ? -Math.abs(candidate.miles - expectedMiles)
    : expectedDuration && candidate.durationMinutes
      ? -Math.abs(candidate.durationMinutes - expectedDuration) / 10
      : candidate.miles;
  const intensityScore = candidate.intensity === "easy" ? 10 : candidate.intensity === "unknown" ? 3 : -10;
  return exposureScore + intensityScore;
}

function notAlignedMentionsIntensity(trace: RecommendationFulfillmentTrace) {
  return (trace.notAlignedIf ?? []).some((item) => /hard|intensity|workout|tempo|interval|race/i.test(item));
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function isHardActivity(activity: Activity) {
  const name = activity.name?.toLowerCase() ?? "";
  return (
    name.includes("tempo") ||
    name.includes("threshold") ||
    name.includes("interval") ||
    name.includes("workout") ||
    name.includes("race") ||
    (activity.perceivedEffort !== undefined && activity.perceivedEffort >= 7) ||
    (activity.relativeEffort !== undefined && activity.relativeEffort >= 80) ||
    (activity.averageHeartRate !== undefined && activity.averageHeartRate >= 155)
  );
}

function intensityForActivity(activity: Activity): "easy" | "moderate" | "hard" | "unknown" {
  if (isHardActivity(activity)) return "hard";
  if (
    activity.perceivedEffort !== undefined ||
    activity.relativeEffort !== undefined ||
    activity.averageHeartRate !== undefined ||
    activity.name
  ) {
    return "easy";
  }
  return "unknown";
}

function miles(meters?: number) {
  return meters ? meters / metersPerMile : 0;
}

function durationMinutes(activity: Activity) {
  return activity.movingTimeSeconds ? Math.round(activity.movingTimeSeconds / 60) : undefined;
}

function localDate(value: string) {
  return value.slice(0, 10);
}

function addUtcDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function endOfUtcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

function unknown(rationale: string): FulfillmentMatchResult {
  return {
    actualFulfillment: "unknown",
    confidence: "low",
    rationale
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
