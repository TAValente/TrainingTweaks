import type {
  Activity,
  AdaptationContext,
  CapacityContext,
  CardioLoad,
  DecisionRiskContext,
  MechanicalExposure,
  NoveltySignal,
  PlannedWorkoutExposure,
  RiskConfidence,
  RiskEngineConfig,
  RiskFinding,
  RiskRuleConfig,
  RiskSeverity,
  SignalSource
} from "./types";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const metersPerMile = 1609.344;

const capacityBestEffortTargets = [
  { distance: "1 mile" as const, meters: 1609.344, highSeconds: 6.5 * 60, moderateSeconds: 8.5 * 60 },
  { distance: "5K" as const, meters: 5000, highSeconds: 22 * 60, moderateSeconds: 28 * 60 },
  { distance: "10K" as const, meters: 10000, highSeconds: 45 * 60, moderateSeconds: 58 * 60 },
  { distance: "Half marathon" as const, meters: 21097.5, highSeconds: 105 * 60, moderateSeconds: 130 * 60 },
  { distance: "Marathon" as const, meters: 42195, highSeconds: 225 * 60, moderateSeconds: 285 * 60 }
];

export const defaultRiskConfig: RiskEngineConfig = {
  version: "load-risk-framework-v1",
  rules: {
    capacityContext: frameworkRule(1825, 0, { yellow: 1, red: 2 }, "medium"),
    adaptationContext: frameworkRule(42, 0, { yellow: 1, red: 2 }, "medium"),
    cardioLoad: frameworkRule(7, 42, { yellow: 1, red: 2 }, "medium"),
    mechanicalExposure: frameworkRule(7, 42, { yellow: 1, red: 2 }, "medium"),
    novelty: frameworkRule(7, 42, { yellow: 1, red: 2 }, "exploratory"),
    decisionRisk: frameworkRule(49, 0, { yellow: 1, red: 2 }, "medium"),
    plannedVsObservedDecisionRisk: frameworkRule(49, 0, { yellow: 1, red: 2 }, "medium"),
    dataQuality: frameworkRule(56, 0, { yellow: 8, red: 3 }, "high")
  },
  hardRunClassification: {
    ...frameworkRule(7, 56, {
      paceFasterThanBaselinePct: 0.1,
      relativeEffortMultiplier: 1.35,
      relativeEffortHigh: 80,
      perceivedEffortHigh: 7,
      streamFastSeconds: 180
    }, "medium"),
    nameKeywords: ["workout", "race", "tempo", "threshold", "interval", "repetition", "speed", "fartlek"]
  }
};

export type ComputeRiskFindingsInput = {
  activities: Activity[];
  asOfDate?: Date;
  config?: RiskEngineConfig;
  plannedWorkout?: PlannedWorkoutExposure;
  runnerProfile?: Record<string, unknown>;
};

type FrameworkContext = {
  asOfDate: Date;
  config: RiskEngineConfig;
  runs: Activity[];
  hardRuns: HardRunClassification[];
  capacity: CapacityContext;
  adaptation: AdaptationContext;
  cardioLoad7: CardioLoad;
  cardioLoad28: CardioLoad;
  mechanical3: MechanicalExposure;
  mechanical7: MechanicalExposure;
  mechanical28: MechanicalExposure;
  noveltySignals: NoveltySignal[];
  decisionRisk: DecisionRiskContext;
  plannedWorkout?: PlannedWorkoutExposure;
};

type HardRunClassification = {
  activity: Activity;
  isHard: boolean;
  reasons: string[];
  confidence: RiskConfidence;
};

type NoveltyConfig = {
  floor: number;
  mildAbsolute: number;
  highAbsolute: number;
  yellowRatio: number;
  redRatio: number;
  unit: string;
  source: SignalSource;
  confidence: RiskConfidence;
};

export function computeRiskFindings({
  activities,
  asOfDate = new Date(),
  config = defaultRiskConfig,
  plannedWorkout
}: ComputeRiskFindingsInput): RiskFinding[] {
  const context = buildFrameworkContext(activities, asOfDate, config, plannedWorkout);
  return [
    ...evaluateDataQuality(context),
    capacityFinding(context),
    adaptationFinding(context),
    cardioLoadFinding(context),
    mechanicalExposureFinding(context),
    ...noveltyFindings(context),
    decisionRiskFinding(context),
    ...plannedVsObservedDecisionRiskFindings(context)
  ];
}

export function buildLoadRiskContext(activities: Activity[], asOfDate = new Date(), config = defaultRiskConfig, plannedWorkout?: PlannedWorkoutExposure) {
  const context = buildFrameworkContext(activities, asOfDate, config, plannedWorkout);
  return {
    capacity: context.capacity,
    adaptation: context.adaptation,
    cardioLoad: context.cardioLoad7,
    mechanicalExposure: context.mechanical7,
    noveltySignals: context.noveltySignals,
    decisionRisk: context.decisionRisk
  };
}

function capacityFinding(context: FrameworkContext): RiskFinding {
  const severity = context.capacity.classification === "unknown" ? "info" : "green";
  return makeFinding(context, {
    ruleId: "capacity_context",
    category: "capacity",
    severity,
    confidence: context.capacity.confidence,
    title: "Capacity context",
    message: capacityMessage(context.capacity),
    observedValue: context.capacity.historicalPeakWeeklyMileage,
    unit: "mi_per_week",
    lookbackDays: 1825,
    evidence: { capacity: context.capacity }
  });
}

function adaptationFinding(context: FrameworkContext): RiskFinding {
  const severity =
    context.capacity.classification === "high" && context.adaptation.classification === "low"
      ? "yellow"
      : context.adaptation.classification === "unknown"
        ? "info"
        : "green";
  return makeFinding(context, {
    ruleId: "adaptation_context",
    category: "adaptation",
    severity,
    confidence: context.adaptation.confidence,
    title: "Current adaptation context",
    message: adaptationMessage(context.capacity, context.adaptation),
    observedValue: context.adaptation.mileagePerWeek28Days,
    unit: "mi_per_week",
    lookbackDays: 42,
    evidence: { capacity: context.capacity, adaptation: context.adaptation }
  });
}

function cardioLoadFinding(context: FrameworkContext): RiskFinding {
  return makeFinding(context, {
    ruleId: "cardio_load_7d",
    category: "cardio_load",
    severity: context.cardioLoad7.cardioLoadScore === undefined ? "info" : "green",
    confidence: context.cardioLoad7.cardioLoadConfidence,
    title: "Cardio load",
    message: context.cardioLoad7.cardioLoadScore === undefined
      ? "No recent Strava relative-effort data is available for cardio load."
      : `Recent cardio load is ${context.cardioLoad7.cardioLoadScore} from ${context.cardioLoad7.cardioLoadSource}.`,
    observedValue: context.cardioLoad7.cardioLoadScore,
    unit: "cardio_load_score",
    lookbackDays: 7,
    evidence: { cardioLoad: context.cardioLoad7 }
  });
}

function mechanicalExposureFinding(context: FrameworkContext): RiskFinding {
  return makeFinding(context, {
    ruleId: "mechanical_exposure_7d",
    category: "mechanical_exposure",
    severity: "green",
    confidence: context.mechanical7.confidence,
    title: "Mechanical exposure",
    message: `Recent mechanical exposure is ${context.mechanical7.distanceMiles} miles with a ${context.mechanical7.longestRunMiles} mile long run.`,
    observedValue: context.mechanical7.distanceMiles,
    unit: "mi",
    lookbackDays: 7,
    evidence: { mechanicalExposure: context.mechanical7 }
  });
}

function noveltyFindings(context: FrameworkContext): RiskFinding[] {
  return context.noveltySignals.map((signal) => makeFinding(context, {
    ruleId: signal.id,
    category: "novelty",
    severity: signal.severity,
    confidence: signal.confidence,
    title: signal.label,
    message: signal.message,
    observedValue: signal.relativeRatio ?? signal.currentValue,
    unit: signal.unit,
    lookbackDays: 49,
    evidence: { noveltySignal: signal }
  }));
}

function decisionRiskFinding(context: FrameworkContext): RiskFinding {
  const riskDrivers = [
    ...context.noveltySignals.filter((signal) => signal.severity === "yellow" || signal.severity === "red"),
    hardDayClusterSignal(context)
  ].filter((signal): signal is NoveltySignal => Boolean(signal));
  const strongest = strongestSeverity(riskDrivers.map((signal) => signal.severity));
  const severity = strongest === "red" ? "red" : strongest === "yellow" ? "yellow" : "green";
  return makeFinding(context, {
    ruleId: "decision_risk_observed",
    category: "decision_risk",
    severity,
    confidence: riskDrivers.some((signal) => signal.confidence === "low") ? "low" : "medium",
    title: "Observed decision risk",
    message: severity === "green"
      ? "Observed training signals do not show unusual exposure that should dominate today's decision."
      : "Observed training includes unusual exposure that should shape today's recommendation.",
    observedValue: riskDrivers.length,
    unit: "risk_drivers",
    lookbackDays: 49,
    evidence: {
      riskDrivers,
      decisionRisk: context.decisionRisk,
      capacity: context.capacity,
      adaptation: context.adaptation
    }
  });
}

function plannedVsObservedDecisionRiskFindings(context: FrameworkContext): RiskFinding[] {
  const planned = context.plannedWorkout;
  if (!planned) return [];

  const riskDrivers = plannedRiskDrivers(context, planned);
  const strongest = strongestSeverity(riskDrivers.map((signal) => signal.severity));
  const severity = strongest === "red" ? "red" : strongest === "yellow" ? "yellow" : "green";
  return [
    makeFinding(context, {
      ruleId: "decision_risk_planned_vs_observed",
      category: "decision_risk",
      severity,
      confidence: planned.confidence,
      title: "Planned-vs-observed decision risk",
      message: plannedDecisionRiskMessage(severity, planned),
      observedValue: riskDrivers.length,
      unit: "risk_drivers",
      lookbackDays: 49,
      evidence: {
        plannedWorkout: planned,
        riskDrivers,
        adaptation: context.adaptation,
        observedDecisionRisk: context.decisionRisk,
        plannedDecisionRisk: plannedDecisionRiskContext(planned)
      }
    })
  ];
}

export function evaluateDataQuality(context: FrameworkContext): RiskFinding[] {
  const recentRuns = runsInWindow(context.runs, context.asOfDate, 0, 56);
  const findings: RiskFinding[] = [];
  if (recentRuns.length < 8) {
    findings.push(makeFinding(context, {
      ruleId: "data_quality_limited_history",
      category: "data_quality",
      severity: "info",
      confidence: "high",
      title: "Limited running history",
      message: "Stored activity history is limited, so capacity, adaptation, and novelty signals have lower confidence.",
      observedValue: recentRuns.length,
      thresholdValue: 8,
      unit: "runs",
      lookbackDays: 56,
      evidence: { runCount: recentRuns.length }
    }));
  }
  if (!recentRuns.some((run) => run.relativeEffort !== undefined || run.perceivedEffort !== undefined)) {
    findings.push(dataAvailabilityFinding(context, "relativeEffort", "Cardio-load data is missing from recent runs."));
  }
  if (!recentRuns.some((run) => run.streamSummary)) {
    findings.push(dataAvailabilityFinding(context, "streamSummary", "Strava streams are not synced yet; fast-running exposure uses low-confidence fallbacks."));
  }
  return findings;
}

function buildFrameworkContext(activities: Activity[], asOfDate: Date, config: RiskEngineConfig, plannedWorkout?: PlannedWorkoutExposure): FrameworkContext {
  const runs = activities.filter(isRun).sort(byOldestStartDate);
  const hardRuns = runs.map((activity) => classifyHardRun(activity, runs, asOfDate, config));
  const capacity = capacityContext(runs, asOfDate);
  const cardioLoad7 = cardioLoad(runsInWindow(runs, asOfDate, 0, 7), 7);
  const cardioLoad28 = cardioLoad(runsInWindow(runs, asOfDate, 0, 28), 28);
  const mechanical3 = mechanicalExposure(runsInWindow(runs, asOfDate, 0, 3), hardRuns, 3);
  const mechanical7 = mechanicalExposure(runsInWindow(runs, asOfDate, 0, 7), hardRuns, 7);
  const mechanical28 = mechanicalExposure(runsInWindow(runs, asOfDate, 0, 28), hardRuns, 28);
  const adaptation = adaptationContext(runs, hardRuns, asOfDate, cardioLoad28, mechanical28);
  const baselineRuns = runsInWindow(runs, asOfDate, 7, 42);
  const baselineCardio = cardioLoad(baselineRuns, 42);
  const baselineMechanical = mechanicalExposure(baselineRuns, hardRuns, 42);
  const noveltySignals = noveltySignalsForContext(runs, asOfDate, cardioLoad7, baselineCardio, mechanical3, mechanical7, baselineMechanical);
  return {
    asOfDate,
    config,
    runs,
    hardRuns,
    capacity,
    adaptation,
    cardioLoad7,
    cardioLoad28,
    mechanical3,
    mechanical7,
    mechanical28,
    noveltySignals,
    decisionRisk: {
      scope: "observed",
      observedWindowDays: 49,
      plannedWorkoutAvailable: false,
      painFatigueInjuryFlagsAvailable: false,
      recommendationUse: "llm_context"
    },
    plannedWorkout
  };
}

function capacityContext(runs: Activity[], asOfDate: Date): CapacityContext {
  const runs182 = runsInWindow(runs, asOfDate, 0, 182);
  const runs730 = runsInWindow(runs, asOfDate, 0, 730);
  const runs1825 = runsInWindow(runs, asOfDate, 0, 1825);
  const peakWeekly = Math.max(0, ...weekBucketsForRuns(runs1825, asOfDate, 1825).map((bucket) => bucket.mileage));
  const longRun = miles(longestRun(runs1825)?.distanceMeters);
  const durableMileagePerWeek = mileage(runs182) / 26;
  const fastestEfforts = capacityFastestEfforts(runs1825);
  const bestEffortClass = capacityClassFromBestEfforts(fastestEfforts);
  const activityClass = peakWeekly >= 35 || longRun >= 14 || runs730.length >= 180
    ? "high"
    : peakWeekly >= 15 || longRun >= 8 || runs182.length >= 40
      ? "moderate"
      : runs1825.length
        ? "low"
        : "unknown";
  const classification = strongerCapacityClass(activityClass, bestEffortClass);
  return {
    source: "strava_activity",
    confidence: runs1825.length >= 20 || fastestEfforts.length ? "medium" : "low",
    historicalPeakWeeklyMileage: round1(peakWeekly),
    historicalLongRunMiles: round1(longRun),
    durableMileagePerWeek: round1(durableMileagePerWeek),
    runCountLast182Days: runs182.length,
    runCountLast730Days: runs730.length,
    runCountLast1825Days: runs1825.length,
    fastestEfforts,
    classification
  };
}

function capacityFastestEfforts(runs: Activity[]) {
  return capacityBestEffortTargets.flatMap((target) => {
    const best = runs
      .flatMap((activity) =>
        (activity.bestEfforts ?? [])
          .filter((effort) => Math.abs(effort.distanceMeters - target.meters) / target.meters <= 0.08)
          .map((effort) => ({ activity, effort }))
      )
      .filter(({ effort }) => effort.elapsedTimeSeconds || effort.movingTimeSeconds)
      .sort((left, right) =>
        (left.effort.elapsedTimeSeconds ?? left.effort.movingTimeSeconds ?? Infinity) -
        (right.effort.elapsedTimeSeconds ?? right.effort.movingTimeSeconds ?? Infinity)
      )[0];
    if (!best) return [];
    const seconds = best.effort.elapsedTimeSeconds ?? best.effort.movingTimeSeconds ?? 0;
    return [{
      period: "5 years" as const,
      distance: target.distance,
      seconds,
      paceSecondsPerMile: seconds / (target.meters / metersPerMile),
      activityName: best.activity.name,
      activityDate: best.activity.startDate.slice(0, 10)
    }];
  }).slice(0, 5);
}

function capacityClassFromBestEfforts(efforts: ReturnType<typeof capacityFastestEfforts>) {
  let best: CapacityContext["classification"] = "unknown";
  for (const effort of efforts) {
    const target = capacityBestEffortTargets.find((candidate) => candidate.distance === effort.distance);
    if (!target) continue;
    if (effort.seconds <= target.highSeconds) return "high";
    if (effort.seconds <= target.moderateSeconds) best = strongerCapacityClass(best, "moderate");
  }
  return best;
}

function strongerCapacityClass(left: CapacityContext["classification"], right: CapacityContext["classification"]) {
  const order: Record<CapacityContext["classification"], number> = { unknown: 0, low: 1, moderate: 2, high: 3 };
  return order[right] > order[left] ? right : left;
}

function adaptationContext(
  runs: Activity[],
  hardRuns: HardRunClassification[],
  asOfDate: Date,
  cardio28: CardioLoad,
  mechanical28: MechanicalExposure
): AdaptationContext {
  const runs7 = runsInWindow(runs, asOfDate, 0, 7);
  const runs28 = runsInWindow(runs, asOfDate, 0, 28);
  const runs42 = runsInWindow(runs, asOfDate, 0, 42);
  const mileage28 = mileage(runs28);
  const mileagePerWeek28 = mileage28 / 4;
  const mileagePerWeek42 = mileage(runs42) / 6;
  const classification = mileagePerWeek28 >= 25 || mechanical28.longestRunMiles >= 10
    ? "high"
    : mileagePerWeek28 >= 10 || runs28.length >= 8
      ? "moderate"
      : runs28.length
        ? "low"
        : "unknown";
  return {
    source: "strava_activity",
    confidence: runs28.length >= 8 ? "medium" : "low",
    mileage7Days: round1(mileage(runs7)),
    mileage28Days: round1(mileage28),
    mileage42Days: round1(mileage(runs42)),
    mileagePerWeek28Days: round1(mileagePerWeek28),
    mileagePerWeek42Days: round1(mileagePerWeek42),
    longRun28DaysMiles: mechanical28.longestRunMiles,
    runCount28Days: runs28.length,
    cardioLoad28Days: cardio28.cardioLoadScore,
    fastRunningSeconds28Days: mechanical28.fastRunningSeconds,
    elevationGain28DaysMeters: mechanical28.elevationGainMeters,
    hardSessions7Days: hardRuns.filter((hardRun) => hardRun.isHard && inWindow(hardRun.activity, asOfDate, 0, 7)).length,
    classification
  };
}

function cardioLoad(runs: Activity[], windowDays: number): CardioLoad {
  const scores = runs.map((run) => run.relativeEffort).filter(isNumber);
  if (scores.length) {
    return {
      cardioLoadScore: round1(sum(scores)),
      cardioLoadSource: "strava",
      cardioLoadConfidence: scores.length >= Math.max(1, runs.length / 2) ? "high" : "medium",
      windowDays
    };
  }
  return { cardioLoadSource: "unknown", cardioLoadConfidence: "low", windowDays };
}

function mechanicalExposure(runs: Activity[], hardRuns: HardRunClassification[], windowDays: number): MechanicalExposure {
  const fastExposure = runs.map((run) => fastExposureForActivity(run, hardRuns));
  const streamFastSeconds = sum(fastExposure.filter((item) => item.source === "streams").map((item) => item.seconds));
  const fallbackHardSeconds = sum(fastExposure.filter((item) => item.source === "activity_summary_fallback").map((item) => item.seconds));
  const hasStreamFastExposure = streamFastSeconds > 0;
  const hasFallbackFastExposure = fallbackHardSeconds > 0;
  const fastRunningSource = hasStreamFastExposure && hasFallbackFastExposure
    ? "mixed"
    : hasStreamFastExposure
      ? "streams"
      : hasFallbackFastExposure
        ? "activity_summary_fallback"
        : "unavailable";
  return {
    source: runs.some((run) => run.streamSummary) ? "strava_streams" : "strava_activity",
    confidence: fastRunningSource === "streams" ? "medium" : "low",
    windowDays,
    distanceMiles: round1(mileage(runs)),
    durationSeconds: sum(runs.map((run) => run.movingTimeSeconds)),
    longestRunMiles: round1(miles(longestRun(runs)?.distanceMeters)),
    fastRunningSeconds: streamFastSeconds + fallbackHardSeconds || undefined,
    fastRunningSource,
    elevationGainMeters: round1(sum(runs.map((run) => run.elevationGainMeters))),
    downhillMeters: round1(sum(runs.map((run) => run.streamSummary?.downhillMeters)))
  };
}

function fastExposureForActivity(activity: Activity, hardRuns: HardRunClassification[]) {
  if (activity.streamSummary) {
    return {
      source: "streams" as const,
      seconds: activity.streamSummary.fastRunningSeconds ?? 0
    };
  }
  const hardRun = hardRuns.find((candidate) => candidate.activity.providerActivityId === activity.providerActivityId);
  return {
    source: hardRun?.isHard ? "activity_summary_fallback" as const : "unavailable" as const,
    seconds: hardRun?.isHard ? Math.min(activity.movingTimeSeconds ?? 0, 20 * 60) : 0
  };
}

function noveltySignalsForContext(
  runs: Activity[],
  asOfDate: Date,
  cardio7: CardioLoad,
  baselineCardio: CardioLoad,
  mechanical3: MechanicalExposure,
  mechanical7: MechanicalExposure,
  baselineMechanical: MechanicalExposure
) {
  const currentMileage = mileage(runsInWindow(runs, asOfDate, 0, 7));
  const baselineMileage = mileage(runsInWindow(runs, asOfDate, 7, 42)) / 6;
  const baselineLongRun = average(weekBucketsForRuns(runsInWindow(runs, asOfDate, 7, 42), asOfDate, 42).map((bucket) => bucket.longestRunMiles).filter((value) => value > 0));
  const baselineElevation = elevationGain(runsInWindow(runs, asOfDate, 7, 42)) / 6;
  return [
    novelty("mileage_novelty", "Mileage novelty", "mileage", currentMileage, baselineMileage, {
      floor: 3,
      mildAbsolute: 3,
      highAbsolute: 10,
      yellowRatio: 1.2,
      redRatio: 1.5,
      unit: "mi",
      source: "strava_activity",
      confidence: "medium"
    }),
    novelty("long_run_novelty", "Long-run novelty", "long_run", mechanical7.longestRunMiles, baselineLongRun, {
      floor: 3,
      mildAbsolute: 2,
      highAbsolute: 5,
      yellowRatio: 1.2,
      redRatio: 1.35,
      unit: "mi",
      source: "strava_activity",
      confidence: "medium"
    }),
    novelty("cardio_load_novelty", "Cardio-load novelty", "cardio_load", cardio7.cardioLoadScore ?? 0, (baselineCardio.cardioLoadScore ?? 0) / 6, {
      floor: 10,
      mildAbsolute: 15,
      highAbsolute: 45,
      yellowRatio: 1.25,
      redRatio: 1.5,
      unit: "cardio_load_score",
      source: cardio7.cardioLoadSource === "strava" ? "strava_effort" : "unknown",
      confidence: cardio7.cardioLoadConfidence
    }),
    novelty("fast_running_novelty", "Fast-running novelty", "fast_running", mechanical7.fastRunningSeconds ?? 0, (baselineMechanical.fastRunningSeconds ?? 0) / 6, {
      floor: 120,
      mildAbsolute: 180,
      highAbsolute: 900,
      yellowRatio: 1.5,
      redRatio: 2,
      unit: "seconds",
      source: mechanical7.fastRunningSource === "streams" ? "strava_streams" : mechanical7.fastRunningSource === "unavailable" ? "unknown" : "trainingtweaks_inferred",
      confidence: mechanical7.fastRunningSource === "streams" ? "medium" : "low"
    }),
    novelty("elevation_novelty", "Elevation exposure novelty", "elevation", mechanical7.elevationGainMeters ?? 0, baselineElevation, {
      floor: 30,
      mildAbsolute: 100,
      highAbsolute: 300,
      yellowRatio: 1.5,
      redRatio: 2,
      unit: "meters",
      source: "strava_activity",
      confidence: "medium"
    }),
    novelty("acute_mechanical_novelty", "Acute mechanical novelty", "mileage", mechanical3.distanceMiles, mechanical7.distanceMiles / 2.33, {
      floor: 2,
      mildAbsolute: 3,
      highAbsolute: 8,
      yellowRatio: 1.5,
      redRatio: 2,
      unit: "mi",
      source: "strava_activity",
      confidence: "medium"
    })
  ];
}

function hardDayClusterSignal(context: FrameworkContext): NoveltySignal | undefined {
  const hardRuns = context.hardRuns.filter((hardRun) => hardRun.isHard && inWindow(hardRun.activity, context.asOfDate, 0, 7)).sort(byOldestClassification);
  const clusteredPairs = hardRuns.filter((hardRun, index) => {
    const next = hardRuns[index + 1];
    return next ? daysBetweenActivities(hardRun.activity, next.activity) <= 1.25 : false;
  }).length;
  if (!clusteredPairs) return undefined;
  const severity = hardRuns.length >= 3 && clusteredPairs >= 2 ? "red" : "yellow";
  return {
    id: "hard_day_clustering",
    label: "Hard-day clustering",
    exposureType: "hard_day_clustering",
    severity,
    confidence: hardRuns.some((hardRun) => hardRun.confidence === "low") ? "low" : "medium",
    currentValue: hardRuns.length,
    baselineValue: 0,
    absoluteChange: hardRuns.length,
    unit: "sessions",
    source: "trainingtweaks_inferred",
    message: "Hard sessions are close together in the recent window."
  };
}

function plannedRiskDrivers(context: FrameworkContext, planned: PlannedWorkoutExposure): NoveltySignal[] {
  const drivers: NoveltySignal[] = [];
  const plannedMiles = planned.targetMiles ?? 0;
  const plannedMinutes = planned.durationMinutes ?? 0;
  const baselineRunMiles = context.adaptation.runCount28Days
    ? context.adaptation.mileage28Days / context.adaptation.runCount28Days
    : 0;

  if (plannedMiles > 0) {
    drivers.push(novelty("planned_distance_vs_adaptation", "Planned distance versus adaptation", "mileage", plannedMiles, baselineRunMiles, {
      floor: 2,
      mildAbsolute: 2,
      highAbsolute: 5,
      yellowRatio: 1.5,
      redRatio: 2,
      unit: "mi",
      source: planned.source === "unknown" ? "unknown" : "trainingtweaks_inferred",
      confidence: planned.confidence
    }));
    drivers.push(novelty("planned_long_run_vs_adaptation", "Planned long run versus adaptation", "long_run", plannedMiles, context.adaptation.longRun28DaysMiles, {
      floor: 3,
      mildAbsolute: 2,
      highAbsolute: 5,
      yellowRatio: 1.2,
      redRatio: 1.35,
      unit: "mi",
      source: planned.source === "unknown" ? "unknown" : "trainingtweaks_inferred",
      confidence: planned.confidence
    }));
  }

  if (plannedMinutes > 0 && context.mechanical7.durationSeconds > 0) {
    drivers.push(novelty("planned_duration_vs_recent", "Planned duration versus recent exposure", "duration", plannedMinutes * 60, context.mechanical7.durationSeconds / Math.max(1, context.runs.filter((run) => inWindow(run, context.asOfDate, 0, 7)).length), {
      floor: 20 * 60,
      mildAbsolute: 15 * 60,
      highAbsolute: 45 * 60,
      yellowRatio: 1.5,
      redRatio: 2,
      unit: "seconds",
      source: planned.source === "unknown" ? "unknown" : "trainingtweaks_inferred",
      confidence: planned.confidence
    }));
  }

  if (planned.intensity === "hard" || planned.intensity === "moderate" || planned.type === "workout" || planned.type === "tempo" || planned.type === "interval") {
    const hardDayDriver = hardDayClusterSignal(context);
    if (hardDayDriver) {
      drivers.push({
        ...hardDayDriver,
        id: "planned_quality_after_recent_cluster",
        label: "Planned quality after recent hard-day clustering",
        message: "The planned workout is quality or moderate/hard while recent hard sessions are already clustered."
      });
    } else if (context.adaptation.hardSessions7Days >= 2) {
      drivers.push({
        id: "planned_quality_density",
        label: "Planned quality density",
        exposureType: "hard_day_clustering",
        severity: "yellow",
        confidence: planned.confidence,
        currentValue: context.adaptation.hardSessions7Days + 1,
        baselineValue: context.adaptation.hardSessions7Days,
        absoluteChange: 1,
        unit: "sessions",
        source: "trainingtweaks_inferred",
        message: "The planned quality workout would add to an already full recent hard-session count."
      });
    }
  }

  return drivers.filter((driver) => driver.severity === "yellow" || driver.severity === "red");
}

function plannedDecisionRiskContext(plannedWorkout: PlannedWorkoutExposure): DecisionRiskContext {
  return {
    scope: "planned_vs_observed",
    observedWindowDays: 49,
    plannedWorkoutAvailable: true,
    plannedWorkout,
    painFatigueInjuryFlagsAvailable: false,
    recommendationUse: "llm_context"
  };
}

function plannedDecisionRiskMessage(severity: RiskSeverity, planned: PlannedWorkoutExposure) {
  const label = planned.type ?? "planned workout";
  if (severity === "red") return `Today's ${label} is a high planned-vs-observed risk against recent adaptation.`;
  if (severity === "yellow") return `Today's ${label} has planned-vs-observed risk that should shape the recommendation.`;
  return `Today's ${label} is not unusual against recent observed adaptation.`;
}

function classifyHardRun(activity: Activity, runs: Activity[], asOfDate: Date, config: RiskEngineConfig): HardRunClassification {
  const baselineRuns = runsInWindow(runs, asOfDate, 0, config.hardRunClassification.baselineDays ?? 56);
  const paceBaseline = medianDefined(baselineRuns.map((run) => run.averagePaceSecondsPerKm));
  const relativeEffortBaseline = averageDefined(baselineRuns.map((run) => run.relativeEffort ?? run.perceivedEffort));
  const reasons: string[] = [];
  const fastSeconds = activity.streamSummary?.fastRunningSeconds ?? 0;
  const name = activity.name?.toLowerCase() ?? "";
  const matchedKeyword = config.hardRunClassification.nameKeywords.find((keyword) => name.includes(keyword));
  if (matchedKeyword) reasons.push(`name_keyword:${matchedKeyword}`);
  if (activity.streamSummary && fastSeconds >= (config.hardRunClassification.thresholds.streamFastSeconds ?? 180)) reasons.push("stream_fast_running");
  if (activity.averagePaceSecondsPerKm && paceBaseline && activity.averagePaceSecondsPerKm <= paceBaseline * (1 - (config.hardRunClassification.thresholds.paceFasterThanBaselinePct ?? 0.1))) {
    reasons.push("pace_above_baseline");
  }
  const relativeEffort = activity.relativeEffort ?? activity.perceivedEffort;
  if (relativeEffort !== undefined && relativeEffort >= (config.hardRunClassification.thresholds.relativeEffortHigh ?? 80)) reasons.push("relative_effort_high");
  else if (relativeEffort !== undefined && relativeEffortBaseline && relativeEffort >= relativeEffortBaseline * (config.hardRunClassification.thresholds.relativeEffortMultiplier ?? 1.35)) reasons.push("relative_effort_above_baseline");
  if (activity.perceivedEffort !== undefined && activity.perceivedEffort >= (config.hardRunClassification.thresholds.perceivedEffortHigh ?? 7)) reasons.push("perceived_effort_high");
  return { activity, isHard: reasons.length > 0, reasons, confidence: activity.streamSummary ? "medium" : "low" };
}

function novelty(id: string, label: string, exposureType: NoveltySignal["exposureType"], currentValue: number, baselineValue: number, config: NoveltyConfig): NoveltySignal {
  const absoluteChange = currentValue - baselineValue;
  const baselineTooSmall = baselineValue < config.floor;
  const relativeRatio = baselineTooSmall ? undefined : currentValue / baselineValue;
  let severity: RiskSeverity = "green";
  if (baselineTooSmall) {
    if (currentValue >= config.highAbsolute) severity = "red";
    else if (currentValue >= config.mildAbsolute) severity = "yellow";
    else if (currentValue > 0) severity = "info";
  } else if (relativeRatio !== undefined) {
    if (relativeRatio >= config.redRatio && absoluteChange >= config.mildAbsolute) severity = "red";
    else if (relativeRatio >= config.yellowRatio && absoluteChange > 0) severity = "yellow";
  }
  return {
    id,
    label,
    exposureType,
    severity,
    confidence: config.confidence,
    currentValue: round1(currentValue),
    baselineValue: round1(baselineValue),
    absoluteChange: round1(absoluteChange),
    relativeRatio: relativeRatio === undefined ? undefined : round2(relativeRatio),
    unit: config.unit,
    source: config.source,
    message: baselineTooSmall
      ? `${label}: current ${round1(currentValue)} ${config.unit} against a near-zero adaptation baseline.`
      : `${label}: current ${round1(currentValue)} ${config.unit} versus ${round1(baselineValue)} adaptation baseline.`
  };
}

function makeFinding(context: FrameworkContext, input: Omit<RiskFinding, "id" | "createdAt" | "framework">): RiskFinding {
  return {
    ...input,
    id: `${input.ruleId}:${input.severity}:${isoDate(context.asOfDate)}`,
    createdAt: context.asOfDate.toISOString(),
    framework: {
      capacity: context.capacity,
      adaptation: context.adaptation,
      cardioLoad: context.cardioLoad7,
      mechanicalExposure: context.mechanical7,
      noveltySignals: context.noveltySignals,
      decisionRisk: context.decisionRisk
    }
  };
}

function dataAvailabilityFinding(context: FrameworkContext, field: string, message: string) {
  return makeFinding(context, {
    ruleId: `data_quality_${field}`,
    category: "data_quality",
    severity: "info",
    confidence: "high",
    title: "Data field unavailable",
    message,
    lookbackDays: 56,
    evidence: { field, available: false }
  });
}

function capacityMessage(capacity: CapacityContext) {
  if (capacity.classification === "unknown") return "Capacity cannot be inferred yet from stored history.";
  return `Capacity appears ${capacity.classification} from historical Strava activity, separate from current preparedness.`;
}

function adaptationMessage(capacity: CapacityContext, adaptation: AdaptationContext) {
  if (capacity.classification === "high" && adaptation.classification === "low") {
    return "This looks like a returning runner pattern: meaningful historical capacity, low current adaptation.";
  }
  if (capacity.classification === "low" && adaptation.classification === "low") {
    return "This looks like a true beginner or very limited imported history: low capacity and low current adaptation.";
  }
  return `Current adaptation appears ${adaptation.classification} based on recent observed training.`;
}

function frameworkRule(lookbackDays: number, baselineDays: number, thresholds: RiskRuleConfig["thresholds"], confidence: RiskConfidence): RiskRuleConfig {
  return { enabled: true, includeGreen: true, lookbackDays, baselineDays, thresholds, confidence };
}

function strongestSeverity(severities: RiskSeverity[]) {
  const order: Record<RiskSeverity, number> = { info: 0, green: 1, yellow: 2, red: 3 };
  return severities.sort((left, right) => order[right] - order[left])[0] ?? "green";
}

function runsInWindow(runs: Activity[], asOfDate: Date, offsetDays: number, days: number) {
  return runs.filter((run) => inWindow(run, asOfDate, offsetDays, days));
}

function inWindow(run: Activity, asOfDate: Date, offsetDays: number, days: number) {
  const end = asOfDate.getTime() - offsetDays * millisecondsPerDay;
  const start = end - days * millisecondsPerDay;
  const time = new Date(run.startDate).getTime();
  return time > start && time <= end;
}

function weekBucketsForRuns(runs: Activity[], asOfDate: Date, days: number) {
  const bucketCount = Math.max(1, Math.floor(days / 7));
  const buckets: Array<{ mileage: number; longestRunMiles: number }> = [];
  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const bucketRuns = runsInWindow(runs, asOfDate, index * 7, 7);
    buckets.push({ mileage: mileage(bucketRuns), longestRunMiles: miles(longestRun(bucketRuns)?.distanceMeters) });
  }
  return buckets;
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function longestRun(runs: Activity[]) {
  return [...runs].sort((left, right) => miles(right.distanceMeters) - miles(left.distanceMeters))[0];
}

function mileage(runs: Activity[]): number {
  return sum(runs.map((run) => miles(run.distanceMeters)));
}

function miles(meters?: number): number {
  return meters ? meters / metersPerMile : 0;
}

function elevationGain(runs: Activity[]) {
  return sum(runs.map((run) => run.elevationGainMeters));
}

function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(isNumber);
  return defined.length ? average(defined) : undefined;
}

function medianDefined(values: Array<number | undefined>): number | undefined {
  const sorted = values.filter(isNumber).sort((left, right) => left - right);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function byOldestStartDate(left: Activity, right: Activity) {
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
}

function byOldestClassification(left: HardRunClassification, right: HardRunClassification) {
  return byOldestStartDate(left.activity, right.activity);
}

function daysBetweenActivities(left: Activity, right: Activity) {
  return Math.abs(new Date(right.startDate).getTime() - new Date(left.startDate).getTime()) / millisecondsPerDay;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
