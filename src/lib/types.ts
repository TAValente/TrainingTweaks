export type Activity = {
  provider: "strava";
  providerActivityId: string;
  startDate: string;
  sportType: string;
  name?: string;
  distanceMeters?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  averagePaceSecondsPerKm?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageCadence?: number;
  elevationGainMeters?: number;
  perceivedEffort?: number;
  relativeEffort?: number;
  bestEfforts?: BestEffort[];
};

export type BestEffort = {
  name?: string;
  distanceMeters: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  startDate?: string;
};

export type StravaTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId?: number;
};

export type TrainingContext = {
  planSource?: TrainingPlanSource;
  planVariant?: string;
  planContext?: string;
  structuredPlan?: StructuredTrainingPlan;
  goalsContext?: string;
  subjectiveContext?: string;
};

export type TrainingPlanSource =
  | "unknown"
  | "hal_higdon"
  | "jack_daniels"
  | "pfitzinger"
  | "hansons"
  | "generic_online"
  | "nike_run_club"
  | "first"
  | "mcmillan"
  | "custom_coach_club"
  | "other_named"
  | "custom";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

export type TrainingPlanDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type TrainingPlanWorkoutType =
  | "rest"
  | "easy"
  | "recovery"
  | "long_run"
  | "workout"
  | "tempo"
  | "interval"
  | "marathon_pace"
  | "cross_training";

export type TrainingPlanWorkout = {
  type: TrainingPlanWorkoutType;
  label: string;
  targetMiles?: number;
  durationMinutes?: number;
  intensity: "off" | "easy" | "moderate" | "hard";
  purpose: string;
  notes?: string;
};

export type TrainingPlanDay = {
  dayOfWeek: TrainingPlanDayOfWeek;
  workout: TrainingPlanWorkout;
};

export type TrainingPlanWeek = {
  weekNumber: number;
  focus: string;
  targetMiles?: number;
  days: TrainingPlanDay[];
};

export type TrainingPlanRiskTolerance = "low" | "regular" | "high";

export type TrainingPlanRiskSeverity = "green" | "yellow" | "red";

export type TrainingPlanRiskRule = {
  ruleId: string;
  label: string;
  yellowAt: number;
  redAt: number;
  unit: string;
};

export type TrainingPlanRiskBudget = {
  tolerance: TrainingPlanRiskTolerance;
  allowedYellow: number;
  allowedRed: number;
  yellowRatio: number;
  redRatio: number;
};

export type TrainingPlanRiskAssessment = {
  weekNumber: number;
  ruleId: string;
  severity: TrainingPlanRiskSeverity;
  observedValue: number;
  unit: string;
  message: string;
  excludedFromBudget?: boolean;
};

export type StructuredTrainingPlanGenerator = {
  id: string;
  version: string;
  plannedPeakMilesPerWeek: number;
  inputs: {
    currentMilesPerWeek: number;
    targetMilesPerWeek: number;
    requestedTargetMilesPerWeek: number;
    durationWeeks: number;
    riskTolerance: TrainingPlanRiskTolerance;
  };
  riskRules: TrainingPlanRiskRule[];
  riskBudget: TrainingPlanRiskBudget;
  riskCounts: Record<TrainingPlanRiskSeverity, number>;
  riskAssessments: TrainingPlanRiskAssessment[];
};

export type StructuredTrainingPlan = {
  schemaVersion: "1";
  id: string;
  sourceId?: string;
  name: string;
  source: "user_import" | "manual" | "trainingtweaks_generic";
  sourceNotes?: string;
  raceDistance?: "5k" | "10k" | "half_marathon" | "marathon";
  durationWeeks: number;
  currentWeek?: number;
  currentDay?: TrainingPlanDayOfWeek;
  weeks: TrainingPlanWeek[];
  generator?: StructuredTrainingPlanGenerator;
};

export type RiskCategory =
  | "load"
  | "long_run"
  | "intensity"
  | "recovery"
  | "novelty"
  | "consistency"
  | "data_quality";

export type RiskSeverity = "info" | "green" | "yellow" | "red";

export type RiskConfidence = "high" | "medium" | "low" | "exploratory";

export type RiskFinding = {
  id: string;
  ruleId: string;
  category: RiskCategory;
  severity: RiskSeverity;
  confidence: RiskConfidence;
  title: string;
  message: string;
  observedValue?: number;
  thresholdValue?: number;
  unit?: string;
  lookbackDays: number;
  evidence: Record<string, unknown>;
  createdAt: string;
};

export type RiskRuleThresholds = {
  green?: number;
  yellow?: number;
  red?: number;
  [key: string]: number | undefined;
};

export type RiskRuleConfig = {
  enabled: boolean;
  includeGreen?: boolean;
  lookbackDays?: number;
  baselineDays?: number;
  minActivities?: number;
  minMileage?: number;
  severities?: Record<string, RiskSeverity>;
  thresholds: RiskRuleThresholds;
  confidence: RiskConfidence;
};

export type RiskEngineConfig = {
  version: string;
  rules: {
    weeklyVolumeGrowth: RiskRuleConfig;
    acwrMileage: RiskRuleConfig;
    consecutiveBuildWeeks: RiskRuleConfig;
    longRunPercentage: RiskRuleConfig;
    longRunJump: RiskRuleConfig;
    hardSessionCount: RiskRuleConfig;
    intensitySpike: RiskRuleConfig;
    hardDayClustering: RiskRuleConfig;
    consecutiveRunningDays: RiskRuleConfig;
    trainingNovelty: RiskRuleConfig;
    dataQuality: RiskRuleConfig;
  };
  hardRunClassification: RiskRuleConfig & {
    nameKeywords: string[];
  };
};

export type StoredModelRun = {
  id: string;
  timestamp: string;
  question: string;
  trainingContext: TrainingContext;
  runningContext?: JsonValue;
  model?: string;
  openAIRequest?: JsonValue;
  rawModelResponse?: JsonValue | string;
  renderedAnswer?: string;
  error?: {
    message: string;
    status?: number;
    rawResponse?: JsonValue | string;
  };
  feedback?: ModelRunFeedback;
};

export type ModelRunFeedback = {
  rating: "positive" | "negative";
  note?: string;
  updatedAt: string;
};

export type AppData = {
  strava?: StravaTokenSet;
  activities: Activity[];
  context?: TrainingContext;
  modelRuns?: StoredModelRun[];
  lastRefreshAt?: string;
};

export type ActivitySummary = {
  lastActivityDate?: string;
  daysSinceLastRun?: number;
  mileageLast7Days: number;
  mileageLast14Days: number;
  mileageLast28Days: number;
  mileageLast42Days: number;
  mileageLast84Days: number;
  mileageLast182Days: number;
  mileageLast730Days: number;
  mileageLast1825Days: number;
  longestRunLast14DaysMiles: number;
  longestRunLast28DaysMiles: number;
  longestRunLast182DaysMiles: number;
  longestRunLast730DaysMiles: number;
  longestRunLast1825DaysMiles: number;
  recentIntensityIndicators: string[];
  recentMissedDays: number;
  runCountLast14Days: number;
  runCountLast28Days: number;
  runCountLast182Days: number;
  runCountLast730Days: number;
  runCountLast1825Days: number;
  averageCadenceLast28Days?: number;
  averageHeartRateLast28Days?: number;
  relativeEffortLast28Days?: number;
  fastestEfforts: FastestEffortSummary[];
};

export type FastestEffortSummary = {
  period: "6 months" | "2 years" | "5 years";
  distance: string;
  seconds: number;
  paceSecondsPerMile: number;
  activityName?: string;
  activityDate: string;
};
