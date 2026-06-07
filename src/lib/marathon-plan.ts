import type {
  StructuredTrainingPlan,
  TrainingPlanDay,
  TrainingPlanDayOfWeek,
  TrainingPlanRiskAssessment,
  TrainingPlanRiskBudget,
  TrainingPlanRiskRule,
  TrainingPlanRiskSeverity,
  TrainingPlanRiskTolerance,
  TrainingPlanWeek,
  TrainingPlanWorkout
} from "./types";

export type MarathonPlanRiskTolerance = TrainingPlanRiskTolerance;

export type StarterMarathonPlanInput = {
  currentMilesPerWeek: number;
  targetMilesPerWeek?: number;
  durationWeeks: number;
  riskTolerance: MarathonPlanRiskTolerance;
  startDate?: string;
};

type RiskProfile = {
  rampRate: number;
  reboundFromCutbacks: boolean;
  cutbackEvery: number;
  cutbackRatio: number;
  longRunShare: number;
  maxPreRaceLongRun: number;
  maxLongRunIncrease: number;
  workoutShare: number;
};

type RiskToleranceConfig = {
  profile: RiskProfile;
  yellowRatio: number;
  redRatio: number;
};

const plannedRiskRules = {
  weeklyVolumeGrowth: {
    ruleId: "weekly_volume_growth",
    label: "Weekly mileage growth",
    yellowAt: 0.1,
    redAt: 0.2,
    unit: "growth_ratio"
  },
  longRunPercentage: {
    ruleId: "long_run_percentage",
    label: "Long run share",
    yellowAt: 0.3,
    redAt: 0.4,
    unit: "share"
  },
  longRunJump: {
    ruleId: "long_run_jump",
    label: "Long run increase",
    yellowAt: 0.2,
    redAt: 0.35,
    unit: "growth_ratio"
  },
  hardSessionCount: {
    ruleId: "hard_session_count",
    label: "Workout count",
    yellowAt: 2,
    redAt: 3,
    unit: "sessions"
  },
  consecutiveBuildWeeks: {
    ruleId: "consecutive_build_weeks",
    label: "Consecutive build weeks",
    yellowAt: 4,
    redAt: 6,
    unit: "weeks"
  }
} satisfies Record<string, TrainingPlanRiskRule>;

const riskToleranceConfigs: Record<MarathonPlanRiskTolerance, RiskToleranceConfig> = {
  low: {
    yellowRatio: 0,
    redRatio: 0,
    profile: {
      rampRate: 0.06,
      reboundFromCutbacks: false,
      cutbackEvery: 3,
      cutbackRatio: 0.9,
      longRunShare: 0.28,
      maxPreRaceLongRun: 18,
      maxLongRunIncrease: 1.5,
      workoutShare: 0.16
    }
  },
  regular: {
    yellowRatio: 0.2,
    redRatio: 0,
    profile: {
      rampRate: 0.08,
      reboundFromCutbacks: true,
      cutbackEvery: 4,
      cutbackRatio: 0.92,
      longRunShare: 0.29,
      maxPreRaceLongRun: 20,
      maxLongRunIncrease: 2,
      workoutShare: 0.18
    }
  },
  high: {
    yellowRatio: 0.65,
    redRatio: 0.1,
    profile: {
      rampRate: 0.12,
      reboundFromCutbacks: true,
      cutbackEvery: 5,
      cutbackRatio: 0.85,
      longRunShare: 0.34,
      maxPreRaceLongRun: 22,
      maxLongRunIncrease: 3,
      workoutShare: 0.2
    }
  }
};

export function buildStarterMarathonPlan(input: StarterMarathonPlanInput): StructuredTrainingPlan {
  const currentMilesPerWeek = round1(Math.max(0, input.currentMilesPerWeek));
  const requestedTargetMilesPerWeek = round1(Math.max(currentMilesPerWeek, input.targetMilesPerWeek ?? currentMilesPerWeek));
  const durationWeeks = clamp(Math.round(input.durationWeeks), 8, 24);
  const riskTolerance = input.riskTolerance;
  const startDate = normalizeDate(input.startDate);
  const toleranceConfig = riskToleranceConfigs[riskTolerance];
  const riskBudget = buildRiskBudget(riskTolerance, durationWeeks, toleranceConfig);
  const { weeks, targetMilesPerWeek, riskAssessments, riskCounts } = buildPlanWithinBudget({
    currentMilesPerWeek,
    requestedTargetMilesPerWeek,
    durationWeeks,
    toleranceConfig,
    riskBudget
  });

  return {
    schemaVersion: "1",
    id: `trainingtweaks-generic:marathon:${durationWeeks}:${riskTolerance}:${currentMilesPerWeek}:${targetMilesPerWeek}`,
    sourceId: "trainingtweaks_generic_marathon_v1",
    name: "TrainingTweaks Generic Marathon",
    source: "trainingtweaks_generic",
    sourceNotes: "Deterministic generic marathon scaffold generated from current mileage, target mileage, plan length, and planned-risk tolerance.",
    raceDistance: "marathon",
    startDate,
    durationWeeks,
    currentWeek: 1,
    currentDay: "monday",
    weeks,
    generator: {
      id: "starter_marathon",
      version: "starter-marathon-v1",
      plannedPeakMilesPerWeek: peakMileage(weeks),
      inputs: {
        currentMilesPerWeek,
        requestedTargetMilesPerWeek,
        targetMilesPerWeek,
        durationWeeks,
        riskTolerance
      },
      riskRules: Object.values(plannedRiskRules),
      riskBudget,
      riskCounts,
      riskAssessments
    }
  };
}

function buildPlanWithinBudget(input: {
  currentMilesPerWeek: number;
  requestedTargetMilesPerWeek: number;
  durationWeeks: number;
  toleranceConfig: RiskToleranceConfig;
  riskBudget: TrainingPlanRiskBudget;
}) {
  let targetMilesPerWeek = input.requestedTargetMilesPerWeek;
  let output = buildPlanAttempt({
    currentMilesPerWeek: input.currentMilesPerWeek,
    targetMilesPerWeek,
    durationWeeks: input.durationWeeks,
    profile: input.toleranceConfig.profile
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (isWithinRiskBudget(output.riskCounts, input.riskBudget)) break;
    targetMilesPerWeek = round1(Math.max(input.currentMilesPerWeek, targetMilesPerWeek * 0.97));
    output = buildPlanAttempt({
      currentMilesPerWeek: input.currentMilesPerWeek,
      targetMilesPerWeek,
      durationWeeks: input.durationWeeks,
      profile: input.toleranceConfig.profile
    });
  }

  return { ...output, targetMilesPerWeek };
}

function buildPlanAttempt(input: {
  currentMilesPerWeek: number;
  targetMilesPerWeek: number;
  durationWeeks: number;
  profile: RiskProfile;
}) {
  const buildWeeks = Math.max(1, input.durationWeeks - 3);
  const buildMileage = buildMileageProgression(input.currentMilesPerWeek, input.targetMilesPerWeek, buildWeeks, input.profile);
  const peakMileage = Math.max(...buildMileage);
  const raceWeekSupportMileage = Math.min(10, Math.max(4, peakMileage * 0.12));
  const weeklyMileage = [
    ...buildMileage,
    round1(Math.max(input.currentMilesPerWeek, peakMileage * 0.85)),
    round1(Math.max(input.currentMilesPerWeek * 0.85, peakMileage * 0.65)),
    round1(Math.max(26.2 + raceWeekSupportMileage, peakMileage * 0.7))
  ].slice(0, input.durationWeeks);

  let previousLongRun = Math.max(4, input.currentMilesPerWeek * input.profile.longRunShare);
  const weeks = weeklyMileage.map((mileage, index) => {
    const weekNumber = index + 1;
    const isRaceWeek = weekNumber === input.durationWeeks;
    const isCutback = !isRaceWeek && weekNumber <= buildWeeks && weekNumber % input.profile.cutbackEvery === 0;
    const longRunMiles = isRaceWeek
      ? 26.2
      : nextLongRun(mileage, previousLongRun, input.profile, isCutback);
    previousLongRun = longRunMiles;
    return makeWeek({
      weekNumber,
      durationWeeks: input.durationWeeks,
      targetMiles: mileage,
      longRunMiles,
      profile: input.profile,
      isCutback,
      isRaceWeek
    });
  });
  const riskAssessments = assessPlannedRisk(weeks, input.currentMilesPerWeek);

  return {
    weeks,
    riskAssessments,
    riskCounts: countBudgetedRiskAssessments(riskAssessments)
  };
}

function buildMileageProgression(
  currentMilesPerWeek: number,
  targetMilesPerWeek: number,
  buildWeeks: number,
  profile: RiskProfile
) {
  const mileage: number[] = [];
  let previous = Math.max(0, currentMilesPerWeek);
  let peakSoFar = previous;
  for (let week = 1; week <= buildWeeks; week += 1) {
    const progress = buildWeeks === 1 ? 1 : (week - 1) / (buildWeeks - 1);
    const desired = currentMilesPerWeek + (targetMilesPerWeek - currentMilesPerWeek) * progress;
    const rampBase = profile.reboundFromCutbacks ? Math.max(previous, peakSoFar) : previous;
    const rampLimit = rampBase * (1 + profile.rampRate);
    const rampLimited = week === 1 ? currentMilesPerWeek : Math.min(desired, rampLimit);
    const cutback = week > 1 && week % profile.cutbackEvery === 0;
    const next = cutback ? Math.max(currentMilesPerWeek * 0.85, peakSoFar * profile.cutbackRatio) : rampLimited;
    mileage.push(round1(next));
    previous = next;
    peakSoFar = Math.max(peakSoFar, next);
  }
  return mileage;
}

function nextLongRun(targetMiles: number, previousLongRun: number, profile: RiskProfile, isCutback: boolean) {
  if (isCutback) {
    return round1(Math.max(4, previousLongRun * profile.cutbackRatio));
  }
  const desired = Math.min(profile.maxPreRaceLongRun, targetMiles * profile.longRunShare);
  return round1(Math.max(4, Math.min(desired, previousLongRun + profile.maxLongRunIncrease)));
}

function makeWeek(input: {
  weekNumber: number;
  durationWeeks: number;
  targetMiles: number;
  longRunMiles: number;
  profile: RiskProfile;
  isCutback: boolean;
  isRaceWeek: boolean;
}): TrainingPlanWeek {
  const runDays = runDayCount(input.targetMiles, input.profile);
  const workoutMiles = input.isRaceWeek ? 0 : workoutMileage(input.targetMiles, input.profile);
  const recoveryMiles = Math.max(0, input.targetMiles - input.longRunMiles - workoutMiles);
  const recoveryRunCount = Math.max(0, runDays - (workoutMiles ? 2 : 1));
  const recoveryPerRun = recoveryRunCount ? round1(recoveryMiles / recoveryRunCount) : 0;
  const days = makeRunDays({
    runDays,
    workoutMiles,
    recoveryPerRun,
    longRunMiles: input.longRunMiles,
    isRaceWeek: input.isRaceWeek
  });

  return {
    weekNumber: input.weekNumber,
    focus: weekFocus(input),
    targetMiles: round1(days.reduce((total, day) => total + (day.workout.targetMiles ?? 0), 0)),
    days
  };
}

function makeRunDays(input: {
  runDays: number;
  workoutMiles: number;
  recoveryPerRun: number;
  longRunMiles: number;
  isRaceWeek: boolean;
}): TrainingPlanDay[] {
  const recovery = (dayOfWeek: TrainingPlanDayOfWeek, label = "Recovery run") =>
    day(dayOfWeek, {
      type: "recovery",
      label,
      targetMiles: input.recoveryPerRun,
      intensity: "easy",
      purpose: "Aerobic support and recovery"
    });

  const days: TrainingPlanDay[] = [];
  if (input.runDays >= 6) days.push(recovery("monday"));
  days.push(
    day("tuesday", {
      type: input.isRaceWeek ? "recovery" : "workout",
      label: input.isRaceWeek ? "Recovery run" : "Workout placeholder",
      targetMiles: input.isRaceWeek ? input.recoveryPerRun : input.workoutMiles,
      intensity: input.isRaceWeek ? "easy" : "moderate",
      purpose: input.isRaceWeek ? "Keep rhythm without fatigue" : "Quality stimulus to be chosen later"
    })
  );
  if (input.runDays >= 4) days.push(recovery("wednesday"));
  if (input.runDays === 3) days.push(recovery("thursday"));
  if (input.runDays >= 5) days.push(recovery("thursday"));
  if (input.runDays >= 4) days.push(recovery("saturday", "Short recovery run"));
  days.push(
    day("sunday", {
      type: "long_run",
      label: input.isRaceWeek ? "Marathon day" : "Long run",
      targetMiles: input.longRunMiles,
      intensity: input.isRaceWeek ? "hard" : "easy",
      purpose: input.isRaceWeek ? "Race execution" : "Endurance and durability"
    })
  );
  return days;
}

function assessPlannedRisk(weeks: TrainingPlanWeek[], currentMilesPerWeek: number): TrainingPlanRiskAssessment[] {
  const assessments: TrainingPlanRiskAssessment[] = [];
  let previousMileage = currentMilesPerWeek;
  let previousLongRun = Math.max(4, currentMilesPerWeek * 0.28);
  let consecutiveBuildWeeks = 0;

  for (const week of weeks) {
    const targetMiles = week.targetMiles ?? 0;
    const longRunMiles = longestRunMiles(week);
    const hardSessionCount = week.days.filter((day) => day.workout.type === "workout").length;
    const isRaceWeek = week.focus === "Race week";
    const growth = previousMileage > 0 ? targetMiles / previousMileage - 1 : 0;
    const longRunShare = targetMiles > 0 ? longRunMiles / targetMiles : 0;
    const longRunJump = previousLongRun > 0 ? longRunMiles / previousLongRun - 1 : 0;

    consecutiveBuildWeeks = targetMiles > previousMileage * 1.01 ? consecutiveBuildWeeks + 1 : 0;

    assessments.push(
      riskAssessment(week.weekNumber, plannedRiskRules.weeklyVolumeGrowth, growth, `${percent(growth)} weekly mileage growth`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.longRunPercentage, longRunShare, `${percent(longRunShare)} of week in long run`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.longRunJump, longRunJump, `${percent(longRunJump)} long-run change`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.hardSessionCount, hardSessionCount, `${hardSessionCount} workout placeholder`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.consecutiveBuildWeeks, consecutiveBuildWeeks, `${consecutiveBuildWeeks} consecutive build weeks`, isRaceWeek)
    );

    previousMileage = targetMiles;
    previousLongRun = longRunMiles;
  }

  return assessments;
}

function riskAssessment(
  weekNumber: number,
  rule: TrainingPlanRiskRule,
  observedValue: number,
  message: string,
  excludedFromBudget: boolean
): TrainingPlanRiskAssessment {
  return {
    weekNumber,
    ruleId: rule.ruleId,
    severity: severityForValue(observedValue, rule),
    observedValue: round2(observedValue),
    unit: rule.unit,
    message,
    excludedFromBudget
  };
}

function countBudgetedRiskAssessments(assessments: TrainingPlanRiskAssessment[]) {
  return assessments.reduce<Record<TrainingPlanRiskSeverity, number>>(
    (counts, assessment) => {
      if (!assessment.excludedFromBudget) counts[assessment.severity] += 1;
      return counts;
    },
    { green: 0, yellow: 0, red: 0 }
  );
}

function buildRiskBudget(
  tolerance: TrainingPlanRiskTolerance,
  durationWeeks: number,
  config: RiskToleranceConfig
): TrainingPlanRiskBudget {
  const budgetedAssessmentCount = Math.max(0, durationWeeks - 1) * Object.keys(plannedRiskRules).length;
  return {
    tolerance,
    allowedYellow: Math.floor(budgetedAssessmentCount * config.yellowRatio),
    allowedRed: Math.floor(budgetedAssessmentCount * config.redRatio),
    yellowRatio: config.yellowRatio,
    redRatio: config.redRatio
  };
}

function isWithinRiskBudget(
  counts: Record<TrainingPlanRiskSeverity, number>,
  budget: TrainingPlanRiskBudget
) {
  return counts.yellow <= budget.allowedYellow && counts.red <= budget.allowedRed;
}

function severityForValue(value: number, rule: TrainingPlanRiskRule): TrainingPlanRiskSeverity {
  if (value >= rule.redAt) return "red";
  if (value >= rule.yellowAt) return "yellow";
  return "green";
}

function longestRunMiles(week: TrainingPlanWeek) {
  return Math.max(...week.days.filter((day) => day.workout.type === "long_run").map((day) => day.workout.targetMiles ?? 0));
}

function peakMileage(weeks: TrainingPlanWeek[]) {
  return Math.max(...weeks.map((week) => week.targetMiles ?? 0));
}

function runDayCount(targetMiles: number, profile: RiskProfile) {
  if (targetMiles >= 55 && profile.longRunShare >= 0.3) return 6;
  if (targetMiles >= 40) return 5;
  if (targetMiles >= 20) return 4;
  return 3;
}

function workoutMileage(targetMiles: number, profile: RiskProfile) {
  const cap = profile.workoutShare >= 0.2 ? 10 : profile.workoutShare >= 0.18 ? 8 : 6;
  return round1(clamp(targetMiles * profile.workoutShare, 3, cap));
}

function weekFocus(input: {
  weekNumber: number;
  durationWeeks: number;
  profile: RiskProfile;
  isCutback: boolean;
  isRaceWeek: boolean;
}) {
  if (input.isRaceWeek) return "Race week";
  if (input.weekNumber > input.durationWeeks - 3) return "Taper and absorb";
  if (input.isCutback) return "Cutback and consolidate";
  return input.profile.rampRate >= 0.1 ? "Build assertively" : "Build aerobic durability";
}

function day(dayOfWeek: TrainingPlanDayOfWeek, workout: TrainingPlanWorkout): TrainingPlanDay {
  return { dayOfWeek, workout };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

function normalizeDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}
