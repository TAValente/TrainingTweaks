import type {
  Activity,
  StructuredTrainingPlan,
  TrainingPlanDay,
  TrainingPlanDayOfWeek,
  TrainingPlanGeneratorAggression,
  TrainingPlanGeneratorGoal,
  TrainingPlanGeneratorStatus,
  TrainingPlanRiskAssessment,
  TrainingPlanRiskBudget,
  TrainingPlanRiskRule,
  TrainingPlanRiskSeverity,
  TrainingPlanRiskTolerance,
  TrainingPlanWeek,
  TrainingPlanWorkout
} from "./types";

const metersPerMile = 1609.344;

export type PlanGeneratorInput = {
  activities: Activity[];
  goalType: TrainingPlanGeneratorGoal;
  startDate?: string;
  targetDate?: string;
  horizonWeeks?: number;
  daysPerWeek: number;
  targetPeakMilesPerWeek: number;
  aggression: TrainingPlanGeneratorAggression;
  asOfDate?: Date;
  preferredLongRunDay?: TrainingPlanDayOfWeek;
};

export type PlanGeneratorResult =
  | {
      ok: true;
      plan: StructuredTrainingPlan;
      status: TrainingPlanGeneratorStatus;
      warnings: string[];
      baseline: PlanBaseline;
    }
  | {
      ok: false;
      status: "not_recommended";
      warnings: string[];
      reason: string;
    };

export type PlanBaseline = {
  selectedWindowWeeks: 4 | 6;
  recentMilesPerWeek: number;
  startingMilesPerWeek: number;
  recentLongRunMiles: number;
  runCount: number;
};

type AggressionConfig = {
  riskTolerance: TrainingPlanRiskTolerance;
  weeklyGrowthCap: number;
  longRunGrowthCap: number;
  weekOneRatio: number;
};

type GoalConfig = {
  minimumWeeks: number;
  peakLeadWeeks: number;
  workoutEveryOtherWeek?: boolean;
  workoutMileageThreshold: number;
  longRunShare: { min: number; preferred: number; max: number };
  crediblePeakLongRun?: number;
  preferredPeakLongRun?: number;
};

type WeeklyAnchor = {
  weekNumber: number;
  mileage: number;
  longRunMiles: number;
  isCutback: boolean;
  isTaper: boolean;
  isRaceWeek: boolean;
};

type PlanValidation = {
  status: TrainingPlanGeneratorStatus;
  warnings: string[];
};

const planGeneratorConfig = {
  version: "plan-generator-v1",
  supportedGoalTypes: ["base_builder", "half_marathon", "marathon"],
  supportedAggressions: ["conservative", "balanced", "aggressive"],
  mileageRounding: {
    baselineIncrement: 1,
    targetPeakIncrement: 1,
    generatedPlanIncrement: 1
  },
  planLengthWeeks: {
    min: 6,
    max: 32
  },
  minimumStartingMilesPerWeek: 12,
  minimumCutbackMilesPerWeek: 15,
  cutback: {
    buildWeeksBeforeCutback: 3,
    ratio: 0.75
  },
  minimumAcceptableWeeklyGain: 2,
  maxWorkoutDayMiles: 8,
  intensePortionShareCap: 0.15,
  daysPerWeek: {
    supported: [3, 4, 5, 6],
    min: 3,
    max: 6
  },
  baseline: {
    longWindowWeeks: 6,
    shortWindowWeeks: 4,
    minimumRuns: 3,
    minimumMilesPerWeekForLongWindow: 10
  },
  goals: {
    base_builder: {
      minimumWeeks: 6,
      peakLeadWeeks: 0,
      workoutEveryOtherWeek: true,
      workoutMileageThreshold: 18,
      longRunShare: { min: 0.25, preferred: 0.35, max: 0.4 }
    },
    half_marathon: {
      minimumWeeks: 8,
      peakLeadWeeks: 2,
      workoutMileageThreshold: 22,
      longRunShare: { min: 0.28, preferred: 0.34, max: 0.4 },
      crediblePeakLongRun: 9,
      preferredPeakLongRun: 11
    },
    marathon: {
      minimumWeeks: 10,
      peakLeadWeeks: 4,
      workoutMileageThreshold: 28,
      longRunShare: { min: 0.3, preferred: 0.42, max: 0.48 },
      crediblePeakLongRun: 16,
      preferredPeakLongRun: 18
    }
  } satisfies Record<TrainingPlanGeneratorGoal, GoalConfig>,
  aggression: {
    conservative: {
      riskTolerance: "low",
      weeklyGrowthCap: 0.08,
      longRunGrowthCap: 1,
      weekOneRatio: 0.96
    },
    balanced: {
      riskTolerance: "regular",
      weeklyGrowthCap: 0.1,
      longRunGrowthCap: 1.5,
      weekOneRatio: 1
    },
    aggressive: {
      riskTolerance: "high",
      weeklyGrowthCap: 0.12,
      longRunGrowthCap: 2,
      weekOneRatio: 1.04
    }
  } satisfies Record<TrainingPlanGeneratorAggression, AggressionConfig>
};

const plannedRiskRules = {
  plannedMileageStep: {
    ruleId: "planned_mileage_step",
    label: "Planned mileage step",
    yellowAt: 0.1,
    redAt: 0.2,
    unit: "growth_ratio"
  },
  plannedLongRunShare: {
    ruleId: "planned_long_run_share",
    label: "Planned long-run share",
    yellowAt: 0.35,
    redAt: 0.45,
    unit: "share"
  },
  plannedLongRunStep: {
    ruleId: "planned_long_run_step",
    label: "Planned long-run step",
    yellowAt: 0.2,
    redAt: 0.35,
    unit: "growth_ratio"
  },
  plannedQualityDensity: {
    ruleId: "planned_quality_density",
    label: "Planned quality density",
    yellowAt: 2,
    redAt: 3,
    unit: "sessions"
  },
  plannedBuildStreak: {
    ruleId: "planned_build_streak",
    label: "Planned build streak",
    yellowAt: 4,
    redAt: 6,
    unit: "weeks"
  }
} satisfies Record<string, TrainingPlanRiskRule>;

const dayOrder: TrainingPlanDayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function generateTrainingPlan(input: PlanGeneratorInput): PlanGeneratorResult {
  const asOfDate = input.asOfDate ?? new Date();
  const goalType = normalizeGoalType(input.goalType);
  if (!goalType) {
    return {
      ok: false,
      status: "not_recommended",
      reason: "Unsupported plan goal type.",
      warnings: [`Supported plan goals are ${planGeneratorConfig.supportedGoalTypes.join(", ")}.`]
    };
  }
  const aggressionKey = normalizeAggression(input.aggression);
  if (!aggressionKey) {
    return {
      ok: false,
      status: "not_recommended",
      reason: "Unsupported plan aggression.",
      warnings: [`Supported aggression values are ${planGeneratorConfig.supportedAggressions.join(", ")}.`]
    };
  }

  const baseline = derivePlanBaseline(input.activities, asOfDate);
  if (!baseline) {
    return {
      ok: false,
      status: "not_recommended",
      reason: "No usable Strava running baseline is available.",
      warnings: ["Connect Strava and refresh recent runs before generating a deterministic plan."]
    };
  }

  const goal = planGeneratorConfig.goals[goalType];
  const aggression = planGeneratorConfig.aggression[aggressionKey];
  const daysPerWeek = normalizeDaysPerWeek(input.daysPerWeek);
  const requestedTarget = Math.max(
    planGeneratorConfig.minimumStartingMilesPerWeek,
    roundToIncrement(input.targetPeakMilesPerWeek, planGeneratorConfig.mileageRounding.targetPeakIncrement)
  );
  const requestedHorizonWeeks = requestedPlanWeeks(input, asOfDate);
  const mathDrivenWeeks = requiredPlanWeeks({
    baseline,
    targetPeakMilesPerWeek: requestedTarget,
    goal,
    aggression
  });
  const durationWeeks = normalizePlanLengthWeeks(requestedHorizonWeeks ?? mathDrivenWeeks);
  const startDate = normalizeDate(input.startDate);
  const anchors = buildWeeklyAnchors({
    baseline,
    goalType,
    goal,
    aggression,
    durationWeeks,
    targetPeakMilesPerWeek: requestedTarget
  });
  const weeks = anchors.map((anchor) =>
    buildWeek({
      anchor,
      daysPerWeek,
      goalType,
      goal,
      longRunDay: input.preferredLongRunDay ?? "sunday"
    })
  );
  const actualPeak = peakMileage(weeks);
  const actualPeakLongRun = preRacePeakLongRun(weeks);
  const warnings = validateGeneratedPlan({
    baseline,
    goalType,
    goal,
    aggression: aggressionKey,
    durationWeeks,
    requestedHorizonWeeks,
    mathDrivenWeeks,
    requestedTarget,
    actualPeak,
    actualPeakLongRun,
    daysPerWeek
  });
  const riskAssessments = assessPlannedRisk(weeks, baseline.startingMilesPerWeek);
  const validation = planValidation(warnings);
  const riskTolerance = aggression.riskTolerance;

  return {
    ok: true,
    plan: {
      schemaVersion: "1",
      id: [
        "trainingtweaks",
        "plan-generator-v1",
        goalType,
        durationWeeks,
        daysPerWeek,
        aggressionKey,
        baseline.startingMilesPerWeek,
        actualPeak
      ].join(":"),
      sourceId: "trainingtweaks_plan_generator_v1",
      name: planName(goalType, aggressionKey),
      source: "trainingtweaks_generic",
      sourceNotes: [
        "Deterministic TrainingTweaks Plan Generator v1.",
        "Uses Strava-derived baseline, parameterized weekly growth, long-run progression, workout density, and validation warnings."
      ].join(" "),
      raceDistance: raceDistance(goalType),
      startDate,
      durationWeeks,
      currentWeek: 1,
      currentDay: "monday",
      weeks,
      generator: {
        id: "plan_generator_v1",
        version: planGeneratorConfig.version,
        plannedPeakMilesPerWeek: actualPeak,
        inputs: {
          goalType,
          daysPerWeek,
          aggression: aggressionKey,
          baselineMilesPerWeek: baseline.recentMilesPerWeek,
          baselineLongRunMiles: baseline.recentLongRunMiles,
          requestedHorizonWeeks,
          actualHorizonWeeks: durationWeeks,
          targetDate: input.targetDate,
          currentMilesPerWeek: baseline.startingMilesPerWeek,
          requestedTargetMilesPerWeek: requestedTarget,
          targetMilesPerWeek: actualPeak,
          durationWeeks,
          riskTolerance
        },
        status: validation.status,
        warnings: validation.warnings,
        riskRules: Object.values(plannedRiskRules),
        riskBudget: buildRiskBudget(riskTolerance, durationWeeks),
        riskCounts: countBudgetedRiskAssessments(riskAssessments),
        riskAssessments
      }
    },
    status: validation.status,
    warnings: validation.warnings,
    baseline
  };
}

export function derivePlanBaseline(activities: Activity[], asOfDate = new Date()): PlanBaseline | undefined {
  const runs = activities.filter(isRun).filter((activity) => miles(activity.distanceMeters) > 0);
  const recentRuns = runs.filter((activity) => daysBetween(new Date(activity.startDate), asOfDate) <= 42);
  if (recentRuns.length < planGeneratorConfig.baseline.minimumRuns) return undefined;

  const weeklyMiles = weeklyMileageBuckets(recentRuns, asOfDate, planGeneratorConfig.baseline.longWindowWeeks);
  const useLongWindow = weeklyMiles.every((mileage) => mileage > planGeneratorConfig.baseline.minimumMilesPerWeekForLongWindow);
  const selectedWindowWeeks = useLongWindow ? 6 : 4;
  const selectedWeeks = weeklyMiles.slice(-selectedWindowWeeks);
  const recentMilesPerWeek = roundToIncrement(
    selectedWeeks.reduce((total, mileage) => total + mileage, 0) / selectedWeeks.length,
    planGeneratorConfig.mileageRounding.baselineIncrement
  );
  if (recentMilesPerWeek <= 0) return undefined;

  return {
    selectedWindowWeeks,
    recentMilesPerWeek,
    startingMilesPerWeek: Math.max(planGeneratorConfig.minimumStartingMilesPerWeek, recentMilesPerWeek),
    recentLongRunMiles: roundToIncrement(
      Math.max(...recentRuns.map((activity) => miles(activity.distanceMeters))),
      planGeneratorConfig.mileageRounding.baselineIncrement
    ),
    runCount: recentRuns.length
  };
}

function requiredPlanWeeks(input: {
  baseline: PlanBaseline;
  targetPeakMilesPerWeek: number;
  goal: GoalConfig;
  aggression: AggressionConfig;
}) {
  const mileageBuildWeeks = buildWeeksNeeded(
    input.baseline.startingMilesPerWeek,
    input.targetPeakMilesPerWeek,
    input.aggression.weeklyGrowthCap,
    planGeneratorConfig.minimumAcceptableWeeklyGain
  );
  const targetLongRun = targetPeakLongRun(input.goal, input.targetPeakMilesPerWeek);
  const longRunBuildWeeks =
    Math.ceil(Math.max(0, targetLongRun - input.baseline.recentLongRunMiles) / input.aggression.longRunGrowthCap) + 1;
  const buildProgressWeeks = Math.max(input.goal.minimumWeeks, mileageBuildWeeks, longRunBuildWeeks);
  return weeksWithCutbacks(buildProgressWeeks) + input.goal.peakLeadWeeks;
}

function requestedPlanWeeks(input: PlanGeneratorInput, asOfDate: Date) {
  if (input.targetDate) {
    const target = parseIsoDate(input.targetDate);
    if (target) return normalizePlanLengthWeeks(Math.ceil((target.getTime() - asOfDate.getTime()) / (7 * millisecondsPerDay)));
  }
  if (input.horizonWeeks !== undefined) return normalizePlanLengthWeeks(input.horizonWeeks);
  return undefined;
}

function buildWeeklyAnchors(input: {
  baseline: PlanBaseline;
  goalType: TrainingPlanGeneratorGoal;
  goal: GoalConfig;
  aggression: AggressionConfig;
  durationWeeks: number;
  targetPeakMilesPerWeek: number;
}): WeeklyAnchor[] {
  const peakWeek = Math.max(1, input.durationWeeks - input.goal.peakLeadWeeks);
  const anchors: WeeklyAnchor[] = [];
  let buildPeakMileage = roundWhole(input.baseline.startingMilesPerWeek * input.aggression.weekOneRatio);
  let buildPeakLongRun = Math.max(4, roundWhole(input.baseline.recentLongRunMiles));
  if (input.goalType === "base_builder") {
    buildPeakLongRun = Math.max(
      buildPeakLongRun,
      roundWhole(buildPeakMileage * preferredLongRunShare(input.goalType, buildPeakMileage, input.goal))
    );
  }

  for (let weekNumber = 1; weekNumber <= input.durationWeeks; weekNumber += 1) {
    const isTaper = weekNumber > peakWeek;
    const isRaceWeek = input.goalType !== "base_builder" && weekNumber === input.durationWeeks;
    const isCutback =
      !isTaper &&
      weekNumber > 1 &&
      weekNumber !== peakWeek &&
      weekNumber % (planGeneratorConfig.cutback.buildWeeksBeforeCutback + 1) === 0;

    if (!isTaper && !isCutback && weekNumber > 1) {
      buildPeakMileage = Math.min(input.targetPeakMilesPerWeek, nextBuildMileage(buildPeakMileage, input.aggression.weeklyGrowthCap));
      buildPeakLongRun = nextBuildLongRun({
        currentPeak: buildPeakLongRun,
        targetPeakMileage: buildPeakMileage,
        goalType: input.goalType,
        goal: input.goal,
        aggression: input.aggression
      });
    }

    const mileage = isTaper
      ? taperMileage(buildPeakMileage, input.goal.peakLeadWeeks, weekNumber - peakWeek)
      : isCutback
        ? Math.max(planGeneratorConfig.minimumCutbackMilesPerWeek, roundWhole(buildPeakMileage * planGeneratorConfig.cutback.ratio))
        : buildPeakMileage;
    const longRunMiles = isTaper
      ? taperLongRun(buildPeakLongRun, input.goalType, input.goal.peakLeadWeeks, weekNumber - peakWeek)
      : isCutback
        ? Math.max(4, Math.ceil(buildPeakLongRun * planGeneratorConfig.cutback.ratio))
        : buildPeakLongRun;

    anchors.push({
      weekNumber,
      mileage,
      longRunMiles,
      isCutback,
      isTaper,
      isRaceWeek
    });
  }

  return anchors;
}

function buildWeek(input: {
  anchor: WeeklyAnchor;
  daysPerWeek: number;
  goalType: TrainingPlanGeneratorGoal;
  goal: GoalConfig;
  longRunDay: TrainingPlanDayOfWeek;
}): TrainingPlanWeek {
  const workout = workoutForWeek(input.anchor, input.goalType, input.goal, input.daysPerWeek);
  const longRun = day(input.longRunDay, {
    type: input.anchor.isRaceWeek ? "long_run" : "long_run",
    label: input.anchor.isRaceWeek ? raceDayLabel(input.goalType) : "Long run",
    targetMiles: input.anchor.isRaceWeek ? raceDistanceMiles(input.goalType) : input.anchor.longRunMiles,
    intensity: input.anchor.isRaceWeek ? "hard" : "easy",
    purpose: input.anchor.isRaceWeek ? "Race execution" : "Endurance and durability"
  });
  const workoutDay = workout ? day(workoutDayForLongRun(input.longRunDay), workout) : undefined;
  const runDays = scheduleRunDays(input.daysPerWeek, input.longRunDay, Boolean(workoutDay));
  const reserved = [longRun, ...(workoutDay ? [workoutDay] : [])];
  const reservedDays = new Set(reserved.map((runDay) => runDay.dayOfWeek));
  const easyDays = runDays.filter((runDay) => !reservedDays.has(runDay));
  const targetMiles = input.anchor.mileage;
  const remainingMiles = Math.max(
    0,
    targetMiles - reserved.reduce((total, runDay) => total + (runDay.workout.targetMiles ?? 0), 0)
  );
  const easyRuns = distributeEasyRuns(remainingMiles, easyDays.length, input.anchor.longRunMiles, targetMiles).map((mileage, index) =>
    day(easyDays[index], {
      type: mileage <= 0 ? "rest" : "recovery",
      label: mileage <= 0 ? "Rest" : "Easy run",
      targetMiles: mileage > 0 ? mileage : undefined,
      intensity: mileage <= 0 ? "off" : "easy",
      purpose: mileage <= 0 ? "Absorb training" : "Aerobic support"
    })
  );
  const days = [...reserved, ...easyRuns].sort((left, right) => dayOrder.indexOf(left.dayOfWeek) - dayOrder.indexOf(right.dayOfWeek));
  const actualMiles = roundWhole(days.reduce((total, runDay) => total + (runDay.workout.targetMiles ?? 0), 0));

  return {
    weekNumber: input.anchor.weekNumber,
    focus: weekFocus(input.anchor, input.goalType),
    targetMiles: actualMiles,
    days
  };
}

function workoutForWeek(
  anchor: WeeklyAnchor,
  goalType: TrainingPlanGeneratorGoal,
  goal: GoalConfig,
  daysPerWeek: number
): TrainingPlanWorkout | undefined {
  if (anchor.isRaceWeek || anchor.isTaper) return undefined;
  if (goalType === "base_builder" && daysPerWeek <= 3) return undefined;
  if (goal.workoutEveryOtherWeek && anchor.weekNumber % 2 === 0) return undefined;
  const targetMiles = anchor.mileage;
  const workoutDayMiles = Math.min(
    planGeneratorConfig.maxWorkoutDayMiles,
    Math.max(3, roundWhole(targetMiles * (goalType === "base_builder" ? 0.15 : 0.18)))
  );
  const intenseMiles = Math.min(round1(targetMiles * planGeneratorConfig.intensePortionShareCap), workoutDayMiles * 0.45);
  if (targetMiles < goal.workoutMileageThreshold) {
    return {
      type: "easy",
      label: "Easy run with strides",
      targetMiles: Math.min(workoutDayMiles, easyRunCap(anchor.longRunMiles)),
      intensity: "easy",
      purpose: "Maintain rhythm without adding a true workout"
    };
  }
  if (goalType === "base_builder") {
    return {
      type: "workout",
      label: anchor.weekNumber % 4 === 1 ? "Strides" : "Light progression",
      targetMiles: Math.min(workoutDayMiles, easyRunCap(anchor.longRunMiles)),
      intensity: "moderate",
      purpose: `${round1(intenseMiles)} mi of light controlled running, not a true tempo or interval session`
    };
  }
  return {
    type: "workout",
    label: goalType === "half_marathon" ? "Controlled quality" : "Marathon support workout",
    targetMiles: Math.min(workoutDayMiles, easyRunCap(anchor.longRunMiles)),
    intensity: "moderate",
    purpose: `${round1(intenseMiles)} mi quality cap inside warmup/cooldown`
  };
}

function distributeEasyRuns(totalMiles: number, count: number, longRunMiles: number, weeklyMileage: number) {
  if (count <= 0) return [];
  const floor = easyRunFloor(weeklyMileage);
  const cap = easyRunCap(longRunMiles);
  const even = roundWhole(totalMiles / count);
  const miles = Array.from({ length: count }, () => clamp(even, Math.min(floor, totalMiles), cap));
  let delta = roundWhole(totalMiles - miles.reduce((total, value) => total + value, 0));
  let index = 0;
  while (Math.abs(delta) >= 1 && index < 100) {
    const slot = index % miles.length;
    const direction = delta > 0 ? 1 : -1;
    const next = miles[slot] + direction;
    if (next >= 0 && (direction < 0 || next <= cap + 2)) {
      miles[slot] = next;
      delta -= direction;
    }
    index += 1;
  }
  return miles.map(roundWhole);
}

function scheduleRunDays(daysPerWeek: number, longRunDay: TrainingPlanDayOfWeek, hasWorkout: boolean) {
  const preferred = {
    3: ["tuesday", "thursday", longRunDay],
    4: ["tuesday", "wednesday", "friday", longRunDay],
    5: longRunDay === "sunday"
      ? ["tuesday", "wednesday", "thursday", "friday", longRunDay]
      : ["monday", "tuesday", "wednesday", "friday", longRunDay],
    6: longRunDay === "sunday"
      ? ["tuesday", "wednesday", "thursday", "friday", "saturday", longRunDay]
      : ["monday", "tuesday", "wednesday", "thursday", "friday", longRunDay]
  } as Record<number, TrainingPlanDayOfWeek[]>;
  const days = [...(preferred[daysPerWeek] ?? preferred[4])];
  const workoutDay = workoutDayForLongRun(longRunDay);
  if (hasWorkout && !days.includes(workoutDay)) days[0] = workoutDay;
  return [...new Set(days)].sort((left, right) => dayOrder.indexOf(left) - dayOrder.indexOf(right));
}

function workoutDayForLongRun(longRunDay: TrainingPlanDayOfWeek) {
  if (longRunDay === "saturday") return "wednesday";
  if (longRunDay === "sunday") return "tuesday";
  return "thursday";
}

function validateGeneratedPlan(input: {
  baseline: PlanBaseline;
  goalType: TrainingPlanGeneratorGoal;
  goal: GoalConfig;
  aggression: TrainingPlanGeneratorAggression;
  durationWeeks: number;
  requestedHorizonWeeks?: number;
  mathDrivenWeeks: number;
  requestedTarget: number;
  actualPeak: number;
  actualPeakLongRun: number;
  daysPerWeek: number;
}) {
  const warnings: string[] = [];

  if (input.actualPeak < input.requestedTarget) {
    warnings.push(
      `You asked to peak at ${input.requestedTarget} MPW. Under ${input.aggression} growth from your recent baseline, this plan reaches ${input.actualPeak} MPW.`
    );
    warnings.push("To reach the requested peak, choose more time, lower the target, or use a more aggressive posture.");
  }
  if (input.goal.crediblePeakLongRun && input.actualPeakLongRun < input.goal.crediblePeakLongRun) {
    warnings.push(
      `This ${goalLabel(input.goalType)} plan reaches a ${input.actualPeakLongRun} mile long run, below the normal ${input.goal.crediblePeakLongRun} mile minimum.`
    );
  }
  if (input.requestedHorizonWeeks && input.requestedHorizonWeeks < input.mathDrivenWeeks) {
    warnings.push(
      `The requested ${input.requestedHorizonWeeks} week timeline is shorter than the ${input.mathDrivenWeeks} weeks suggested by your Strava baseline and goal.`
    );
  }
  if (input.goalType === "marathon" && input.baseline.startingMilesPerWeek <= 12 && input.durationWeeks <= 12) {
    warnings.push("This marathon setup starts from a low recent baseline and is not recommended as a normal plan.");
  }
  if (input.daysPerWeek < 4 && input.goalType === "marathon") {
    warnings.push("A marathon plan on fewer than 4 running days per week is compromised for most runners.");
  }

  return warnings;
}

function planValidation(warnings: string[]): PlanValidation {
  const notRecommended = warnings.some((warning) => warning.includes("not recommended"));
  if (notRecommended) return { status: "not_recommended", warnings };
  if (warnings.length) return { status: "compromised", warnings };
  return { status: "feasible", warnings };
}

function assessPlannedRisk(weeks: TrainingPlanWeek[], currentMilesPerWeek: number): TrainingPlanRiskAssessment[] {
  const assessments: TrainingPlanRiskAssessment[] = [];
  let previousMileage = currentMilesPerWeek;
  let previousLongRun = Math.max(4, currentMilesPerWeek * 0.28);
  let plannedBuildStreak = 0;

  for (const week of weeks) {
    const targetMiles = week.targetMiles ?? 0;
    const longRunMiles = longestRunMiles(week);
    const plannedQualityCount = week.days.filter((day) => day.workout.type === "workout").length;
    const isRaceWeek = week.focus === "Race week";
    const growth = previousMileage > 0 ? targetMiles / previousMileage - 1 : 0;
    const longRunShare = targetMiles > 0 ? longRunMiles / targetMiles : 0;
    const plannedLongRunStep = previousLongRun > 0 ? longRunMiles / previousLongRun - 1 : 0;
    plannedBuildStreak = targetMiles > previousMileage * 1.01 ? plannedBuildStreak + 1 : 0;

    assessments.push(
      riskAssessment(week.weekNumber, plannedRiskRules.plannedMileageStep, growth, `${percent(growth)} planned mileage step`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.plannedLongRunShare, longRunShare, `${percent(longRunShare)} of week in long run`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.plannedLongRunStep, plannedLongRunStep, `${percent(plannedLongRunStep)} planned long-run step`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.plannedQualityDensity, plannedQualityCount, `${plannedQualityCount} workout`, isRaceWeek),
      riskAssessment(week.weekNumber, plannedRiskRules.plannedBuildStreak, plannedBuildStreak, `${plannedBuildStreak} consecutive planned build weeks`, isRaceWeek)
    );

    previousMileage = targetMiles;
    previousLongRun = longRunMiles;
  }

  return assessments;
}

function weeklyMileageBuckets(runs: Activity[], asOfDate: Date, weeks: number) {
  const newestWindowStart = startOfDay(new Date(asOfDate.getTime() - weeks * 7 * millisecondsPerDay));
  return Array.from({ length: weeks }, (_, index) => {
    const start = new Date(newestWindowStart.getTime() + index * 7 * millisecondsPerDay);
    const end = new Date(start.getTime() + 7 * millisecondsPerDay);
    return round1(
      runs
        .filter((activity) => {
          const date = new Date(activity.startDate);
          return date >= start && date < end;
        })
        .reduce((total, activity) => total + miles(activity.distanceMeters), 0)
    );
  });
}

function buildWeeksNeeded(start: number, target: number, growthCap: number, minimumGain: number) {
  if (target <= start) return 1;
  let weeks = 1;
  let current = start;
  while (current < target && weeks < 80) {
    current = nextBuildMileage(current, growthCap, minimumGain);
    weeks += 1;
  }
  return weeks;
}

function weeksWithCutbacks(buildProgressWeeks: number) {
  const buildWeeksBeforeCutback = planGeneratorConfig.cutback.buildWeeksBeforeCutback;
  if (buildProgressWeeks <= buildWeeksBeforeCutback) return buildProgressWeeks;
  const cutbacks = Math.floor((buildProgressWeeks - 1) / buildWeeksBeforeCutback);
  return buildProgressWeeks + cutbacks;
}

function nextBuildMileage(current: number, growthCap: number, minimumGain = planGeneratorConfig.minimumAcceptableWeeklyGain) {
  return roundWhole(current + Math.max(minimumGain, current * growthCap));
}

function nextBuildLongRun(input: {
  currentPeak: number;
  targetPeakMileage: number;
  goalType: TrainingPlanGeneratorGoal;
  goal: GoalConfig;
  aggression: AggressionConfig;
}) {
  const share = preferredLongRunShare(input.goalType, input.targetPeakMileage, input.goal);
  const maxShare = maxLongRunShare(input.goalType, input.targetPeakMileage, input.goal);
  const desired = Math.max(targetPeakLongRun(input.goal, input.targetPeakMileage), input.targetPeakMileage * share);
  const cappedDesired = Math.min(desired, input.targetPeakMileage * maxShare);
  return roundWhole(Math.min(cappedDesired, input.currentPeak + input.aggression.longRunGrowthCap));
}

function targetPeakLongRun(goal: GoalConfig, targetPeakMileage: number) {
  const shareBased = targetPeakMileage * goal.longRunShare.preferred;
  const preferred = goal.preferredPeakLongRun ?? goal.crediblePeakLongRun ?? shareBased;
  return Math.min(Math.max(preferred, goal.crediblePeakLongRun ?? 0, shareBased), targetPeakMileage * goal.longRunShare.max);
}

function preferredLongRunShare(goalType: TrainingPlanGeneratorGoal, weeklyMileage: number, goal: GoalConfig) {
  if (goalType === "base_builder" && weeklyMileage <= 20) return 0.42;
  return goal.longRunShare.preferred;
}

function maxLongRunShare(goalType: TrainingPlanGeneratorGoal, weeklyMileage: number, goal: GoalConfig) {
  if (goalType === "base_builder" && weeklyMileage <= 20) return 0.45;
  return goal.longRunShare.max;
}

function taperMileage(peakMileage: number, taperWeeks: number, taperIndex: number) {
  if (taperWeeks <= 0) return peakMileage;
  const ratios = taperWeeks >= 4 ? [0.85, 0.72, 0.58, 0.7] : [0.8, 0.65, 0.7];
  return roundWhole(peakMileage * (ratios[taperIndex - 1] ?? 0.7));
}

function taperLongRun(peakLongRun: number, goalType: TrainingPlanGeneratorGoal, taperWeeks: number, taperIndex: number) {
  if (taperIndex === taperWeeks && goalType !== "base_builder") return raceDistanceMiles(goalType);
  const ratios = taperWeeks >= 4 ? [0.78, 0.62, 0.45, 0.35] : [0.65, 0.45, 0.35];
  return Math.max(4, roundWhole(peakLongRun * (ratios[taperIndex - 1] ?? 0.5)));
}

function easyRunFloor(weeklyMileage: number) {
  if (weeklyMileage >= 40) return 6;
  if (weeklyMileage >= 30) return 5;
  if (weeklyMileage >= 20) return 4;
  return 3;
}

function easyRunCap(longRunMiles: number) {
  return Math.min(8, Math.max(3, Math.floor((longRunMiles * 2) / 3)));
}

function buildRiskBudget(tolerance: TrainingPlanRiskTolerance, durationWeeks: number): TrainingPlanRiskBudget {
  const ratios = {
    low: { yellowRatio: 0, redRatio: 0 },
    regular: { yellowRatio: 0.2, redRatio: 0 },
    high: { yellowRatio: 0.65, redRatio: 0.1 }
  }[tolerance];
  const budgetedAssessmentCount = Math.max(0, durationWeeks - 1) * Object.keys(plannedRiskRules).length;
  return {
    tolerance,
    allowedYellow: Math.floor(budgetedAssessmentCount * ratios.yellowRatio),
    allowedRed: Math.floor(budgetedAssessmentCount * ratios.redRatio),
    yellowRatio: ratios.yellowRatio,
    redRatio: ratios.redRatio
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

function severityForValue(value: number, rule: TrainingPlanRiskRule): TrainingPlanRiskSeverity {
  if (value >= rule.redAt) return "red";
  if (value >= rule.yellowAt) return "yellow";
  return "green";
}

function longestRunMiles(week: TrainingPlanWeek) {
  return Math.max(...week.days.filter((runDay) => runDay.workout.type === "long_run").map((runDay) => runDay.workout.targetMiles ?? 0));
}

function peakMileage(weeks: TrainingPlanWeek[]) {
  return Math.max(...weeks.map((week) => week.targetMiles ?? 0));
}

function peakLongRun(weeks: TrainingPlanWeek[]) {
  return Math.max(...weeks.map(longestRunMiles));
}

function preRacePeakLongRun(weeks: TrainingPlanWeek[]) {
  const preRaceWeeks = weeks.filter((week) => week.focus !== "Race week");
  return peakLongRun(preRaceWeeks.length ? preRaceWeeks : weeks);
}

function weekFocus(anchor: WeeklyAnchor, goalType: TrainingPlanGeneratorGoal) {
  if (anchor.isRaceWeek) return "Race week";
  if (anchor.isTaper) return "Taper and absorb";
  if (anchor.isCutback) return "Cutback and consolidate";
  if (goalType === "base_builder") return "Build aerobic base";
  return "Build specific endurance";
}

function raceDistance(goalType: TrainingPlanGeneratorGoal): StructuredTrainingPlan["raceDistance"] {
  if (goalType === "half_marathon") return "half_marathon";
  if (goalType === "marathon") return "marathon";
  return undefined;
}

function raceDistanceMiles(goalType: TrainingPlanGeneratorGoal) {
  if (goalType === "marathon") return 26.2;
  if (goalType === "half_marathon") return 13.1;
  return 0;
}

function raceDayLabel(goalType: TrainingPlanGeneratorGoal) {
  if (goalType === "half_marathon") return "Half marathon day";
  if (goalType === "marathon") return "Marathon day";
  return "Long run";
}

function planName(goalType: TrainingPlanGeneratorGoal, aggression: TrainingPlanGeneratorAggression) {
  return `TrainingTweaks ${aggression} ${goalLabel(goalType)} plan`;
}

function goalLabel(goalType: TrainingPlanGeneratorGoal) {
  if (goalType === "base_builder") return "base builder";
  if (goalType === "half_marathon") return "half marathon";
  return "marathon";
}

function day(dayOfWeek: TrainingPlanDayOfWeek, workout: TrainingPlanWorkout): TrainingPlanDay {
  return { dayOfWeek, workout };
}

function normalizeGoalType(value: unknown): TrainingPlanGeneratorGoal | undefined {
  return planGeneratorConfig.supportedGoalTypes.includes(value as TrainingPlanGeneratorGoal)
    ? (value as TrainingPlanGeneratorGoal)
    : undefined;
}

function normalizeAggression(value: unknown): TrainingPlanGeneratorAggression | undefined {
  return planGeneratorConfig.supportedAggressions.includes(value as TrainingPlanGeneratorAggression)
    ? (value as TrainingPlanGeneratorAggression)
    : undefined;
}

function normalizeDaysPerWeek(value: number) {
  const rounded = Math.round(value);
  return nearestSupportedNumber(rounded, planGeneratorConfig.daysPerWeek.supported);
}

function normalizePlanLengthWeeks(value: number) {
  return clamp(Math.round(value), planGeneratorConfig.planLengthWeeks.min, planGeneratorConfig.planLengthWeeks.max);
}

function nearestSupportedNumber(value: number, supported: number[]) {
  if (!Number.isFinite(value)) return supported[0];
  return supported.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  );
}

function isRun(activity: Activity) {
  return activity.sportType.toLowerCase().includes("run");
}

function miles(meters?: number) {
  return meters ? meters / metersPerMile : 0;
}

function daysBetween(then: Date, now: Date) {
  return Math.max(0, (now.getTime() - then.getTime()) / millisecondsPerDay);
}

function parseIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return startOfDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function normalizeDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundWhole(value: number) {
  return Math.round(value);
}

function roundToIncrement(value: number, increment: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / increment) * increment;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
