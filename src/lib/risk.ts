import type {
  Activity,
  RiskCategory,
  RiskConfidence,
  RiskEngineConfig,
  RiskFinding,
  RiskRuleConfig,
  RiskSeverity
} from "./types";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const metersPerMile = 1609.344;
const defaultLookbackDays = 7;
const defaultBaselineDays = 28;

export const defaultRiskConfig: RiskEngineConfig = {
  version: "risk-v1",
  rules: {
    weeklyVolumeGrowth: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      minActivities: 2,
      minMileage: 3,
      thresholds: { green: 0.1, yellow: 0.1, red: 0.2 },
      confidence: "medium"
    },
    acwrMileage: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      baselineDays: 28,
      minActivities: 4,
      minMileage: 5,
      thresholds: { green: 1.2, yellow: 1.2, red: 1.5 },
      confidence: "high"
    },
    consecutiveBuildWeeks: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      baselineDays: 56,
      minActivities: 6,
      thresholds: { green: 0, yellow: 4, red: 6 },
      confidence: "medium"
    },
    longRunPercentage: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      minActivities: 2,
      minMileage: 8,
      thresholds: { green: 0, yellow: 0.3, red: 0.4 },
      confidence: "high"
    },
    longRunJump: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      baselineDays: 28,
      minActivities: 4,
      minMileage: 8,
      thresholds: { green: 0, yellow: 0.2, red: 0.35 },
      confidence: "medium"
    },
    hardSessionCount: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      minActivities: 2,
      thresholds: { green: 0, yellow: 2, red: 3 },
      confidence: "high"
    },
    intensitySpike: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      baselineDays: 28,
      minActivities: 4,
      thresholds: { green: 0, yellow: 0.25, red: 0.5 },
      confidence: "medium"
    },
    hardDayClustering: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 7,
      severities: {
        backToBackHard: "yellow",
        hardNearLong: "yellow",
        threeHardSessions: "red",
        hardLongHard: "red"
      },
      thresholds: {
        hardBackToBackDays: 1,
        hardLongHours: 24,
        threeHardSessionsDays: 5,
        hardLongHardDays: 4
      },
      confidence: "high"
    },
    consecutiveRunningDays: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 14,
      thresholds: { green: 0, yellow: 5, red: 7 },
      confidence: "medium"
    },
    trainingNovelty: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 14,
      baselineDays: 56,
      minActivities: 6,
      thresholds: {
        green: 0,
        yellow: 2,
        red: 4,
        componentYellowRatio: 1.2,
        componentRedRatio: 1.5
      },
      confidence: "exploratory"
    },
    dataQuality: {
      enabled: true,
      includeGreen: true,
      lookbackDays: 56,
      minActivities: 8,
      severities: {
        limitedHistory: "info",
        missingField: "info"
      },
      thresholds: { paceBaselineRuns: 5 },
      confidence: "high"
    }
  },
  hardRunClassification: {
    enabled: true,
    includeGreen: false,
    baselineDays: 56,
    minActivities: 5,
    thresholds: {
      paceFasterThanBaselinePct: 0.1,
      heartRateAboveBaselinePct: 0.08,
      relativeEffortMultiplier: 1.35,
      relativeEffortHigh: 80,
      perceivedEffortHigh: 7
    },
    confidence: "medium",
    nameKeywords: ["workout", "race", "tempo", "threshold", "interval", "repetition", "speed", "fartlek"]
  }
};

export type ComputeRiskFindingsInput = {
  activities: Activity[];
  asOfDate?: Date;
  config?: RiskEngineConfig;
  runnerProfile?: Record<string, unknown>;
};

type RiskContext = {
  asOfDate: Date;
  config: RiskEngineConfig;
  runs: Activity[];
  hardRuns: HardRunClassification[];
};

type HardRunClassification = {
  activity: Activity;
  isHard: boolean;
  reasons: string[];
  evidence: Record<string, unknown>;
};

type WeekBucket = {
  startDate: string;
  endDate: string;
  runs: Activity[];
  mileage: number;
  longestRunMiles: number;
  hardSessionCount: number;
  elevationGainMeters: number;
};

type HardLoadProxy = {
  proxy: "relative_effort" | "heart_rate_time" | "pace_deviation_miles" | "hard_session_count";
  value: number;
  confidence: RiskConfidence;
};

export function computeRiskFindings({
  activities,
  asOfDate = new Date(),
  config = defaultRiskConfig
}: ComputeRiskFindingsInput): RiskFinding[] {
  const context = buildRiskContext(activities, asOfDate, config);
  return [
    ...evaluateDataQuality(context),
    ...evaluateWeeklyVolumeGrowth(context),
    ...evaluateAcwr(context),
    ...evaluateConsecutiveBuildWeeks(context),
    ...evaluateLongRunPercentage(context),
    ...evaluateLongRunJump(context),
    ...evaluateHardSessionCount(context),
    ...evaluateIntensitySpike(context),
    ...evaluateHardDayClustering(context),
    ...evaluateConsecutiveRunningDays(context),
    ...evaluateTrainingNovelty(context)
  ];
}

export function evaluateWeeklyVolumeGrowth(context: RiskContext): RiskFinding[] {
  const ruleId = "weekly_volume_growth";
  const rule = context.config.rules.weeklyVolumeGrowth;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const current = runsInWindow(context.runs, context.asOfDate, 0, days);
  const prior = runsInWindow(context.runs, context.asOfDate, days, days);
  if (current.length < (rule.minActivities ?? 0) || mileage(current) < (rule.minMileage ?? 0)) return [];
  if (mileage(prior) < (rule.minMileage ?? 0)) {
    return [
      makeFinding(context, rule, {
        ruleId,
        category: "data_quality",
        severity: "info",
        title: "Prior-week mileage baseline is limited",
        message: "Prior 7-day mileage is too low to compare weekly volume growth confidently.",
        observedValue: round1(mileage(prior)),
        thresholdValue: rule.minMileage,
        unit: "mi",
        lookbackDays: days * 2,
        evidence: { currentMileage: round1(mileage(current)), priorMileage: round1(mileage(prior)) }
      })
    ];
  }

  const growth = mileage(current) / mileage(prior) - 1;
  const severity = severityFromThresholds(growth, rule);
  if (!shouldEmit(severity, rule)) return [];
  const growthDirection = growth >= 0 ? "above" : "below";
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "load",
      severity,
      title: severity === "green" ? "Weekly volume growth is within guardrails" : "Weekly volume increased",
      message: `Current ${days}-day mileage is ${percent(Math.abs(growth))} ${growthDirection} the prior ${days} days.`,
      observedValue: round2(growth),
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "growth_ratio",
      lookbackDays: days * 2,
      evidence: { currentMileage: round1(mileage(current)), priorMileage: round1(mileage(prior)), currentRunCount: current.length, priorRunCount: prior.length }
    })
  ];
}

export function evaluateAcwr(context: RiskContext): RiskFinding[] {
  const ruleId = "acwr_mileage";
  const rule = context.config.rules.acwrMileage;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const baselineDays = rule.baselineDays ?? defaultBaselineDays;
  const current = runsInWindow(context.runs, context.asOfDate, 0, days);
  const baseline = runsInWindow(context.runs, context.asOfDate, days, baselineDays);
  const baselineMileage = mileage(baseline);
  if (current.length < (rule.minActivities ?? 0) && mileage(current) < (rule.minMileage ?? 0)) return [];
  if (baselineMileage < (rule.minMileage ?? 0)) {
    return [
      makeFinding(context, rule, {
        ruleId,
        category: "data_quality",
        severity: "info",
        title: "Chronic mileage baseline is limited",
        message: "Trailing mileage baseline is too low to compute acute/chronic workload ratio confidently.",
        observedValue: round1(baselineMileage),
        thresholdValue: rule.minMileage,
        unit: "mi",
        lookbackDays: days + baselineDays,
        evidence: { currentMileage: round1(mileage(current)), baselineMileage: round1(baselineMileage), baselineDays }
      })
    ];
  }

  const averageBaselineWeek = baselineMileage / (baselineDays / days);
  const ratio = mileage(current) / averageBaselineWeek;
  const severity = severityFromThresholds(ratio, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "load",
      severity,
      title: severity === "green" ? "Acute mileage load is within guardrails" : "Acute mileage load is elevated",
      message: `Current ${days}-day mileage is ${round2(ratio)}x the trailing weekly baseline.`,
      observedValue: round2(ratio),
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "ratio",
      lookbackDays: days + baselineDays,
      evidence: { currentMileage: round1(mileage(current)), averageBaselineWeek: round1(averageBaselineWeek), baselineMileage: round1(baselineMileage) }
    })
  ];
}

export function evaluateConsecutiveBuildWeeks(context: RiskContext): RiskFinding[] {
  const ruleId = "consecutive_build_weeks";
  const rule = context.config.rules.consecutiveBuildWeeks;
  if (!rule.enabled) return [];

  const buckets = weekBuckets(context, rule).filter((bucket) => bucket.mileage > 0);
  if (buckets.flatMap((bucket) => bucket.runs).length < (rule.minActivities ?? 0)) return [];
  let streak = 0;
  for (let index = buckets.length - 1; index > 0; index -= 1) {
    if (buckets[index].mileage > buckets[index - 1].mileage) streak += 1;
    else break;
  }

  const severity = severityFromThresholds(streak, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "load",
      severity,
      title: severity === "green" ? "Build-week streak is within guardrails" : "Consecutive build weeks detected",
      message: `Weekly mileage has increased for ${streak} consecutive week-to-week comparisons.`,
      observedValue: streak,
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "weeks",
      lookbackDays: rule.baselineDays ?? 56,
      evidence: { weeklyMileage: buckets.map((bucket) => round1(bucket.mileage)), weeks: buckets.map(({ startDate, endDate }) => ({ startDate, endDate })) }
    })
  ];
}

export function evaluateLongRunPercentage(context: RiskContext): RiskFinding[] {
  const ruleId = "long_run_percentage";
  const rule = context.config.rules.longRunPercentage;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const current = runsInWindow(context.runs, context.asOfDate, 0, days);
  const totalMileage = mileage(current);
  if (totalMileage < (rule.minMileage ?? 0) || current.length < (rule.minActivities ?? 0)) return [];

  const longest = longestRun(current);
  const share = miles(longest?.distanceMeters) / totalMileage;
  const severity = severityFromThresholds(share, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "long_run",
      severity,
      title: severity === "green" ? "Long run share is within guardrails" : "Long run share is elevated",
      message: `Longest run was ${percent(share)} of ${days}-day mileage.`,
      observedValue: round2(share),
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "share",
      lookbackDays: days,
      evidence: { totalMileage: round1(totalMileage), longestRunMiles: round1(miles(longest?.distanceMeters)), runCount: current.length, longestRunId: longest?.providerActivityId }
    })
  ];
}

export function evaluateLongRunJump(context: RiskContext): RiskFinding[] {
  const ruleId = "long_run_jump";
  const rule = context.config.rules.longRunJump;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const baselineDays = rule.baselineDays ?? defaultBaselineDays;
  const current = runsInWindow(context.runs, context.asOfDate, 0, days);
  if (mileage(current) < (rule.minMileage ?? 0)) return [];
  const currentLongest = miles(longestRun(current)?.distanceMeters);
  const baselineBuckets = weekBuckets(context, { ...rule, baselineDays }).slice(0, -1);
  const baselineLongRuns = baselineBuckets.map((bucket) => bucket.longestRunMiles).filter((value) => value > 0);
  if (baselineLongRuns.length < Math.max(1, Math.floor((rule.minActivities ?? 4) / 2))) return [];
  const baselineAverage = average(baselineLongRuns);
  if (!baselineAverage) return [];
  const jump = currentLongest / baselineAverage - 1;
  const severity = severityFromThresholds(jump, rule);
  if (!shouldEmit(severity, rule)) return [];
  const jumpDirection = jump >= 0 ? "above" : "below";
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "long_run",
      severity,
      title: severity === "green" ? "Long run change is within guardrails" : "Long run increased from baseline",
      message: `Current long run is ${percent(Math.abs(jump))} ${jumpDirection} the prior long-run baseline.`,
      observedValue: round2(jump),
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "growth_ratio",
      lookbackDays: days + baselineDays,
      evidence: { currentLongestMiles: round1(currentLongest), baselineAverageLongestMiles: round1(baselineAverage), baselineLongRuns: baselineLongRuns.map(round1) }
    })
  ];
}

export function evaluateHardSessionCount(context: RiskContext): RiskFinding[] {
  const ruleId = "hard_session_count";
  const rule = context.config.rules.hardSessionCount;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const hardRuns = hardRunsInWindow(context, 0, days);
  const severity = severityFromThresholds(hardRuns.length, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "intensity",
      severity,
      title: severity === "green" ? "Hard session count is within guardrails" : "Hard session count is elevated",
      message: `${hardRuns.length} inferred hard sessions occurred in the last ${days} days.`,
      observedValue: hardRuns.length,
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "sessions",
      lookbackDays: days,
      evidence: { hardRuns: hardRuns.map(hardRunEvidence) }
    })
  ];
}

export function evaluateIntensitySpike(context: RiskContext): RiskFinding[] {
  const ruleId = "intensity_spike";
  const rule = context.config.rules.intensitySpike;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const baselineDays = rule.baselineDays ?? defaultBaselineDays;
  const currentProxy = hardLoadProxy(context, 0, days);
  const baselineProxy = hardLoadProxy(context, days, baselineDays);
  const averageBaseline = baselineProxy.value / (baselineDays / days);
  if (!currentProxy.value || !averageBaseline) return [];
  const increase = currentProxy.value / averageBaseline - 1;
  const severity = severityFromThresholds(increase, rule);
  if (!shouldEmit(severity, rule)) return [];
  const increaseDirection = increase >= 0 ? "above" : "below";
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "intensity",
      severity,
      confidence: currentProxy.confidence,
      title: severity === "green" ? "Intensity load is within guardrails" : "Intensity load increased",
      message: `Current hard-load proxy is ${percent(Math.abs(increase))} ${increaseDirection} the trailing baseline.`,
      observedValue: round2(increase),
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "growth_ratio",
      lookbackDays: days + baselineDays,
      evidence: { proxy: currentProxy.proxy, currentValue: round1(currentProxy.value), averageBaselineValue: round1(averageBaseline), baselineValue: round1(baselineProxy.value) }
    })
  ];
}

export function evaluateHardDayClustering(context: RiskContext): RiskFinding[] {
  const ruleId = "hard_day_clustering";
  const rule = context.config.rules.hardDayClustering;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? defaultLookbackDays;
  const hardRuns = hardRunsInWindow(context, 0, days).sort(byOldestClassification);
  const currentRuns = runsInWindow(context.runs, context.asOfDate, 0, days);
  const long = longestRun(currentRuns);
  const findings: RiskFinding[] = [];
  const backToBackDays = rule.thresholds.hardBackToBackDays ?? 1;
  const threeHardDays = rule.thresholds.threeHardSessionsDays ?? 5;
  const hardLongHours = rule.thresholds.hardLongHours ?? 24;
  const hardLongHardDays = rule.thresholds.hardLongHardDays ?? 4;

  if (hasBackToBackHardRuns(hardRuns, backToBackDays)) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity: configuredSeverity(rule, "backToBackHard", "yellow"),
      title: "Hard sessions are close together",
      message: "Hard sessions occurred on back-to-back days.",
      observedValue: backToBackDays,
      thresholdValue: backToBackDays,
      unit: "days",
      lookbackDays: days,
      evidence: { hardRuns: hardRuns.map(hardRunEvidence) }
    }));
  }

  if (long && hardRuns.some((hardRun) => Math.abs(hoursBetween(hardRun.activity, long)) <= hardLongHours && hardRun.activity.providerActivityId !== long.providerActivityId)) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity: configuredSeverity(rule, "hardNearLong", "yellow"),
      title: "Hard session clustered with long run",
      message: `A hard session occurred within ${hardLongHours} hours of the long run.`,
      observedValue: hardLongHours,
      thresholdValue: hardLongHours,
      unit: "hours",
      lookbackDays: days,
      evidence: { longestRun: activityEvidence(long), hardRuns: hardRuns.map(hardRunEvidence) }
    }));
  }

  if (hasThreeHardRunsWithinDays(hardRuns, threeHardDays)) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity: configuredSeverity(rule, "threeHardSessions", "red"),
      title: "Three hard sessions are clustered",
      message: `Three hard sessions occurred within ${threeHardDays} days.`,
      observedValue: 3,
      thresholdValue: 3,
      unit: "sessions",
      lookbackDays: days,
      evidence: { hardRuns: hardRuns.map(hardRunEvidence) }
    }));
  }

  if (long && hasHardLongHardPattern(hardRuns, long, hardLongHardDays)) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity: configuredSeverity(rule, "hardLongHard", "red"),
      title: "Hard-long-hard pattern detected",
      message: `Hard sessions appear on both sides of the long run within ${hardLongHardDays} days.`,
      observedValue: hardLongHardDays,
      thresholdValue: hardLongHardDays,
      unit: "days",
      lookbackDays: days,
      evidence: { longestRun: activityEvidence(long), hardRuns: hardRuns.map(hardRunEvidence) }
    }));
  }

  if (!findings.length && rule.includeGreen) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity: "green",
      title: "Hard-day spacing is within guardrails",
      message: "No configured hard-day clustering pattern was detected.",
      observedValue: hardRuns.length,
      thresholdValue: rule.thresholds.threeHardSessionsDays,
      unit: "hard_sessions",
      lookbackDays: days,
      evidence: { hardRuns: hardRuns.map(hardRunEvidence) }
    }));
  }

  return dedupeRuleFindings(findings);
}

export function evaluateConsecutiveRunningDays(context: RiskContext): RiskFinding[] {
  const ruleId = "consecutive_running_days";
  const rule = context.config.rules.consecutiveRunningDays;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? 14;
  const streak = consecutiveRunDays(runsInWindow(context.runs, context.asOfDate, 0, days), context.asOfDate);
  const severity = severityFromThresholds(streak, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "recovery",
      severity,
      title: severity === "green" ? "Running streak is within guardrails" : "Running streak is elevated",
      message: `${streak} consecutive running days detected.`,
      observedValue: streak,
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "days",
      lookbackDays: days,
      evidence: { streakDays: streak }
    })
  ];
}

export function evaluateTrainingNovelty(context: RiskContext): RiskFinding[] {
  const ruleId = "training_novelty";
  const rule = context.config.rules.trainingNovelty;
  if (!rule.enabled) return [];

  const currentDays = rule.lookbackDays ?? 14;
  const baselineDays = rule.baselineDays ?? 56;
  const current = aggregate(runsInWindow(context.runs, context.asOfDate, 0, currentDays), context);
  const baseline = aggregate(runsInWindow(context.runs, context.asOfDate, currentDays, baselineDays), context);
  if (baseline.runCount < (rule.minActivities ?? 0)) return [];

  const currentScale = currentDays / 7;
  const baselineScale = baselineDays / 7;
  const components = {
    mileage: componentNovelty(current.mileage / currentScale, baseline.mileage / baselineScale, rule),
    runFrequency: componentNovelty(current.runCount / currentScale, baseline.runCount / baselineScale, rule),
    elevationGain: componentNovelty(current.elevationGainMeters / currentScale, baseline.elevationGainMeters / baselineScale, rule),
    hardSessions: componentNovelty(current.hardSessionCount / currentScale, baseline.hardSessionCount / baselineScale, rule),
    longRun: componentNovelty(current.longestRunMiles, baseline.longestRunMiles, rule)
  };
  const score = Object.values(components).reduce((total, component) => total + component.score, 0);
  const severity = severityFromThresholds(score, rule);
  if (!shouldEmit(severity, rule)) return [];
  return [
    makeFinding(context, rule, {
      ruleId,
      category: "novelty",
      severity,
      title: severity === "green" ? "Training block novelty is within guardrails" : "Training block novelty is elevated",
      message: severity === "green" ? "Current training block is close to the recent baseline." : severity === "red" ? "Current training block differs substantially from the recent baseline." : "Current training block differs from the recent baseline.",
      observedValue: score,
      thresholdValue: thresholdForSeverity(severity, rule),
      unit: "novelty_points",
      lookbackDays: currentDays + baselineDays,
      evidence: { components, current, baseline }
    })
  ];
}

export function evaluateDataQuality(context: RiskContext): RiskFinding[] {
  const ruleId = "data_quality";
  const rule = context.config.rules.dataQuality;
  if (!rule.enabled) return [];

  const days = rule.lookbackDays ?? 56;
  const runs = runsInWindow(context.runs, context.asOfDate, 0, days);
  const findings: RiskFinding[] = [];
  if (runs.length < (rule.minActivities ?? 0)) {
    findings.push(makeFinding(context, rule, {
      ruleId,
      category: "data_quality",
      severity: configuredSeverity(rule, "limitedHistory", "info"),
      title: "Limited running history",
      message: "Stored activity history is limited, so some risk findings may have lower confidence.",
      observedValue: runs.length,
      thresholdValue: rule.minActivities,
      unit: "runs",
      lookbackDays: days,
      evidence: { runCount: runs.length }
    }));
  }

  if (!runs.some((run) => run.averageHeartRate !== undefined)) {
    findings.push(dataAvailabilityFinding(context, rule, "averageHeartRate", "Heart-rate data is missing from recent runs."));
  }
  if (!runs.some((run) => run.relativeEffort !== undefined || run.perceivedEffort !== undefined)) {
    findings.push(dataAvailabilityFinding(context, rule, "relativeEffort", "Relative-effort data is missing from recent runs."));
  }
  if (!runs.some((run) => run.averagePaceSecondsPerKm !== undefined) || runs.filter((run) => run.averagePaceSecondsPerKm !== undefined).length < (rule.thresholds.paceBaselineRuns ?? 0)) {
    findings.push(dataAvailabilityFinding(context, rule, "averagePaceSecondsPerKm", "Pace data is limited, so hard-session inference may rely on names or effort fields."));
  }
  findings.push(dataAvailabilityFinding(context, rule, "gearId", "Gear or shoe data is not currently stored on activities."));

  return findings;
}

function buildRiskContext(activities: Activity[], asOfDate: Date, config: RiskEngineConfig): RiskContext {
  const runs = activities.filter(isRun).sort(byOldestStartDate);
  const context: RiskContext = { asOfDate, config, runs, hardRuns: [] };
  context.hardRuns = runs.map((activity) => classifyHardRun(activity, context));
  return context;
}

function classifyHardRun(activity: Activity, context: RiskContext): HardRunClassification {
  const config = context.config.hardRunClassification;
  if (!config.enabled) return { activity, isHard: false, reasons: [], evidence: {} };

  const baselineRuns = runsInWindow(context.runs, context.asOfDate, 0, config.baselineDays ?? 56);
  const paceBaseline = medianDefined(baselineRuns.map((run) => run.averagePaceSecondsPerKm));
  const heartRateBaseline = averageDefined(baselineRuns.map((run) => run.averageHeartRate));
  const relativeEffortBaseline = averageDefined(baselineRuns.map((run) => run.relativeEffort ?? run.perceivedEffort));
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {
    activity: activityEvidence(activity),
    paceBaseline,
    heartRateBaseline,
    relativeEffortBaseline
  };

  const name = activity.name?.toLowerCase() ?? "";
  const matchedKeyword = config.nameKeywords.find((keyword) => name.includes(keyword));
  if (matchedKeyword) reasons.push(`name_keyword:${matchedKeyword}`);

  const paceThreshold = config.thresholds.paceFasterThanBaselinePct ?? 0;
  if (activity.averagePaceSecondsPerKm && paceBaseline && activity.averagePaceSecondsPerKm <= paceBaseline * (1 - paceThreshold)) {
    reasons.push("pace_above_baseline");
  }

  const heartRateThreshold = config.thresholds.heartRateAboveBaselinePct ?? 0;
  if (activity.averageHeartRate && heartRateBaseline && activity.averageHeartRate >= heartRateBaseline * (1 + heartRateThreshold)) {
    reasons.push("heart_rate_above_baseline");
  }

  const relativeEffort = activity.relativeEffort ?? activity.perceivedEffort;
  const relativeEffortHigh = config.thresholds.relativeEffortHigh;
  const relativeEffortMultiplier = config.thresholds.relativeEffortMultiplier ?? 0;
  if (relativeEffort !== undefined && relativeEffortHigh !== undefined && relativeEffort >= relativeEffortHigh) {
    reasons.push("relative_effort_high");
  } else if (relativeEffort !== undefined && relativeEffortBaseline && relativeEffort >= relativeEffortBaseline * relativeEffortMultiplier) {
    reasons.push("relative_effort_above_baseline");
  }

  const perceivedEffortHigh = config.thresholds.perceivedEffortHigh;
  if (activity.perceivedEffort !== undefined && perceivedEffortHigh !== undefined && activity.perceivedEffort >= perceivedEffortHigh) {
    reasons.push("perceived_effort_high");
  }

  return { activity, isHard: reasons.length > 0, reasons, evidence };
}

function runsInWindow(runs: Activity[], asOfDate: Date, offsetDays: number, days: number) {
  const end = asOfDate.getTime() - offsetDays * millisecondsPerDay;
  const start = end - days * millisecondsPerDay;
  return runs.filter((run) => {
    const time = new Date(run.startDate).getTime();
    return time > start && time <= end;
  });
}

function weekBuckets(context: RiskContext, rule: Pick<RiskRuleConfig, "baselineDays" | "lookbackDays">): WeekBucket[] {
  const days = rule.lookbackDays ?? 7;
  const totalDays = rule.baselineDays ?? 56;
  const bucketCount = Math.max(1, Math.floor(totalDays / days));
  const buckets: WeekBucket[] = [];
  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const offset = index * days;
    const runs = runsInWindow(context.runs, context.asOfDate, offset, days);
    const start = new Date(context.asOfDate.getTime() - (offset + days) * millisecondsPerDay);
    const end = new Date(context.asOfDate.getTime() - offset * millisecondsPerDay);
    buckets.push({
      startDate: isoDate(start),
      endDate: isoDate(end),
      runs,
      mileage: mileage(runs),
      longestRunMiles: miles(longestRun(runs)?.distanceMeters),
      hardSessionCount: runs.filter((run) => isHardRun(context, run)).length,
      elevationGainMeters: sum(runs.map((run) => run.elevationGainMeters))
    });
  }
  return buckets;
}

function hardRunsInWindow(context: RiskContext, offsetDays: number, days: number) {
  const runs = new Set(runsInWindow(context.runs, context.asOfDate, offsetDays, days).map((run) => run.providerActivityId));
  return context.hardRuns.filter((classification) => classification.isHard && runs.has(classification.activity.providerActivityId));
}

function hardLoadProxy(context: RiskContext, offsetDays: number, days: number): HardLoadProxy {
  const windowRuns = runsInWindow(context.runs, context.asOfDate, offsetDays, days);
  const relativeEfforts = windowRuns.map((run) => run.relativeEffort).filter(isNumber);
  if (relativeEfforts.length) return { proxy: "relative_effort", value: sum(relativeEfforts), confidence: "high" as RiskConfidence };

  const heartRateLoads = windowRuns
    .map((run) => run.averageHeartRate && run.movingTimeSeconds ? run.averageHeartRate * (run.movingTimeSeconds / 3600) : undefined)
    .filter(isNumber);
  if (heartRateLoads.length) return { proxy: "heart_rate_time", value: sum(heartRateLoads), confidence: "high" as RiskConfidence };

  const paceProxy = windowRuns
    .map((run) => {
      const classification = context.hardRuns.find((hardRun) => hardRun.activity.providerActivityId === run.providerActivityId);
      return classification?.reasons.includes("pace_above_baseline") ? miles(run.distanceMeters) : 0;
    });
  if (paceProxy.some((value) => value > 0)) return { proxy: "pace_deviation_miles", value: sum(paceProxy), confidence: "medium" as RiskConfidence };

  return { proxy: "hard_session_count", value: hardRunsInWindow(context, offsetDays, days).length, confidence: "medium" as RiskConfidence };
}

function aggregate(runs: Activity[], context: RiskContext) {
  return {
    mileage: round1(mileage(runs)),
    runCount: runs.length,
    elevationGainMeters: round1(sum(runs.map((run) => run.elevationGainMeters))),
    hardSessionCount: runs.filter((run) => isHardRun(context, run)).length,
    longestRunMiles: round1(miles(longestRun(runs)?.distanceMeters))
  };
}

function componentNovelty(current: number, baseline: number, rule: RiskRuleConfig) {
  if (!baseline) return { ratio: current ? undefined : 0, score: 0 };
  const ratio = current / baseline;
  const score = ratio >= (rule.thresholds.componentRedRatio ?? Infinity) ? 2 : ratio >= (rule.thresholds.componentYellowRatio ?? Infinity) ? 1 : 0;
  return { ratio: round2(ratio), score, current: round1(current), baseline: round1(baseline) };
}

function makeFinding(
  context: RiskContext,
  rule: RiskRuleConfig,
  input: Omit<RiskFinding, "id" | "confidence" | "createdAt"> & { confidence?: RiskConfidence }
): RiskFinding {
  return {
    ...input,
    id: `${input.ruleId}:${input.severity}:${isoDate(context.asOfDate)}`,
    confidence: input.confidence ?? rule.confidence,
    createdAt: context.asOfDate.toISOString()
  };
}

function dataAvailabilityFinding(context: RiskContext, rule: RiskRuleConfig, field: string, message: string) {
  return makeFinding(context, rule, {
    ruleId: "data_quality",
    category: "data_quality",
    severity: configuredSeverity(rule, "missingField", "info"),
    title: "Data field unavailable",
    message,
    lookbackDays: rule.lookbackDays ?? 56,
    evidence: { field, available: false }
  });
}

function severityFromThresholds(value: number, rule: RiskRuleConfig): RiskSeverity {
  if (rule.thresholds.red !== undefined && value >= rule.thresholds.red) return "red";
  if (rule.thresholds.yellow !== undefined && value >= rule.thresholds.yellow) return "yellow";
  if (rule.thresholds.green !== undefined) return "green";
  return "info";
}

function configuredSeverity(rule: RiskRuleConfig, key: string, fallback: RiskSeverity) {
  return rule.severities?.[key] ?? fallback;
}

function thresholdForSeverity(severity: RiskSeverity, rule: RiskRuleConfig) {
  return rule.thresholds[severity];
}

function shouldEmit(severity: RiskSeverity, rule: RiskRuleConfig) {
  return severity === "yellow" || severity === "red" || severity === "info" || (severity === "green" && rule.includeGreen);
}

function hasBackToBackHardRuns(hardRuns: HardRunClassification[], days: number) {
  return hardRuns.some((hardRun, index) => {
    const next = hardRuns[index + 1];
    return next ? daysBetweenActivities(hardRun.activity, next.activity) <= days : false;
  });
}

function hasThreeHardRunsWithinDays(hardRuns: HardRunClassification[], days: number) {
  return hardRuns.some((hardRun, index) => {
    const third = hardRuns[index + 2];
    return third ? daysBetweenActivities(hardRun.activity, third.activity) <= days : false;
  });
}

function hasHardLongHardPattern(hardRuns: HardRunClassification[], longRun: Activity, days: number) {
  const longTime = new Date(longRun.startDate).getTime();
  const before = hardRuns.some((hardRun) => {
    const time = new Date(hardRun.activity.startDate).getTime();
    return time < longTime && (longTime - time) / millisecondsPerDay <= days;
  });
  const after = hardRuns.some((hardRun) => {
    const time = new Date(hardRun.activity.startDate).getTime();
    return time > longTime && (time - longTime) / millisecondsPerDay <= days;
  });
  return before && after;
}

function consecutiveRunDays(runs: Activity[], asOfDate: Date) {
  const daysWithRuns = new Set(runs.map((run) => isoDate(new Date(run.startDate))));
  let streak = 0;
  for (let offset = 0; offset <= runs.length + 1; offset += 1) {
    const date = new Date(asOfDate.getTime() - offset * millisecondsPerDay);
    if (!daysWithRuns.has(isoDate(date))) break;
    streak += 1;
  }
  return streak;
}

function dedupeRuleFindings(findings: RiskFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.ruleId}:${finding.title}:${finding.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function isHardRun(context: RiskContext, activity: Activity) {
  return Boolean(context.hardRuns.find((hardRun) => hardRun.activity.providerActivityId === activity.providerActivityId)?.isHard);
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

function average(values: number[]): number {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter(isNumber);
  if (!defined.length) return undefined;
  return average(defined);
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

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
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

function hoursBetween(left: Activity, right: Activity) {
  return (new Date(left.startDate).getTime() - new Date(right.startDate).getTime()) / (60 * 60 * 1000);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function activityEvidence(activity: Activity) {
  return {
    id: activity.providerActivityId,
    name: activity.name,
    startDate: activity.startDate,
    distanceMiles: round1(miles(activity.distanceMeters)),
    averagePaceSecondsPerKm: activity.averagePaceSecondsPerKm,
    averageHeartRate: activity.averageHeartRate,
    relativeEffort: activity.relativeEffort,
    perceivedEffort: activity.perceivedEffort,
    elevationGainMeters: activity.elevationGainMeters
  };
}

function hardRunEvidence(classification: HardRunClassification) {
  return {
    ...activityEvidence(classification.activity),
    reasons: classification.reasons,
    classificationEvidence: classification.evidence
  };
}
