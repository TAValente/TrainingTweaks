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
  streamSync?: ActivityStreamSyncMetadata;
  streams?: ActivityStreams;
  streamSummary?: ActivityStreamSummary;
};

export type BestEffort = {
  name?: string;
  distanceMeters: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  startDate?: string;
};

export type ActivityStreamSummary = {
  source: "strava_streams";
  fetchedAt: string;
  availableTypes: StravaStreamType[];
  sampleCount?: number;
  movingSeconds?: number;
  fastRunningSeconds?: number;
  fastRunningSource?: "personalized_stream_zone";
  fastRunningConfidence?: RiskConfidence;
  downhillMeters?: number;
  sharpPaceChangeCount?: number;
};

export type ActivityStreamSyncStatus = "not_attempted" | "fetched" | "failed" | "unavailable" | "rate_limited";

export type ActivityStreamSyncMetadata = {
  status: ActivityStreamSyncStatus;
  mode: "full" | "selective" | "off";
  attemptedAt?: string;
  fetchedAt?: string;
  failedAt?: string;
  failureReason?: string;
  unavailableReason?: string;
  streamTypes?: StravaStreamType[];
};

export type ActivityStreams = Partial<Record<StravaStreamType, ActivityStream>>;

export type ActivityStream = {
  type: StravaStreamType;
  data: Array<number | boolean | [number, number]>;
  seriesType?: string;
  originalSize?: number;
  resolution?: string;
};

export type StravaStreamType =
  | "time"
  | "distance"
  | "latlng"
  | "altitude"
  | "velocity_smooth"
  | "heartrate"
  | "cadence"
  | "watts"
  | "temp"
  | "moving"
  | "grade_smooth";

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
export type TrainingPlanGeneratorGoal = "base_builder" | "half_marathon" | "marathon";
export type TrainingPlanGeneratorAggression = "conservative" | "balanced" | "aggressive";
export type TrainingPlanGeneratorStatus = "feasible" | "compromised" | "not_recommended";

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
    goalType?: TrainingPlanGeneratorGoal;
    daysPerWeek?: number;
    aggression?: TrainingPlanGeneratorAggression;
    baselineMilesPerWeek?: number;
    baselineLongRunMiles?: number;
    requestedHorizonWeeks?: number;
    actualHorizonWeeks?: number;
    targetDate?: string;
    currentMilesPerWeek: number;
    targetMilesPerWeek: number;
    requestedTargetMilesPerWeek: number;
    durationWeeks: number;
    riskTolerance: TrainingPlanRiskTolerance;
  };
  status?: TrainingPlanGeneratorStatus;
  warnings?: string[];
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
  startDate?: string;
  durationWeeks: number;
  currentWeek?: number;
  currentDay?: TrainingPlanDayOfWeek;
  weeks: TrainingPlanWeek[];
  generator?: StructuredTrainingPlanGenerator;
};

export type RiskCategory =
  | "capacity"
  | "adaptation"
  | "cardio_load"
  | "mechanical_exposure"
  | "novelty"
  | "decision_risk"
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
  framework?: {
    capacity?: CapacityContext;
    adaptation?: AdaptationContext;
    cardioLoad?: CardioLoad;
    mechanicalExposure?: MechanicalExposure;
    noveltySignals?: NoveltySignal[];
    decisionRisk?: DecisionRiskContext;
  };
};

export type SignalSource =
  | "strava_activity"
  | "strava_effort"
  | "strava_streams"
  | "trainingtweaks_inferred"
  | "manual"
  | "unknown";

export type CapacityContext = {
  source: SignalSource;
  confidence: RiskConfidence;
  historicalPeakWeeklyMileage?: number;
  historicalLongRunMiles?: number;
  durableMileagePerWeek?: number;
  runCountLast182Days?: number;
  runCountLast730Days?: number;
  runCountLast1825Days?: number;
  fastestEfforts?: FastestEffortSummary[];
  classification: "low" | "moderate" | "high" | "unknown";
};

export type AdaptationContext = {
  source: SignalSource;
  confidence: RiskConfidence;
  mileage7Days: number;
  mileage28Days: number;
  mileage42Days: number;
  mileagePerWeek28Days: number;
  mileagePerWeek42Days: number;
  longRun28DaysMiles: number;
  runCount28Days: number;
  cardioLoad28Days?: number;
  fastRunningSeconds28Days?: number;
  elevationGain28DaysMeters?: number;
  hardSessions7Days: number;
  classification: "low" | "moderate" | "high" | "unknown";
};

export type CardioLoad = {
  cardioLoadScore?: number;
  cardioLoadSource: "strava" | "internal" | "manual" | "unknown";
  cardioLoadConfidence: RiskConfidence;
  windowDays: number;
};

export type MechanicalExposure = {
  source: SignalSource;
  confidence: RiskConfidence;
  windowDays: number;
  distanceMiles: number;
  durationSeconds: number;
  longestRunMiles: number;
  fastRunningSeconds?: number;
  fastRunningSource: "streams" | "activity_summary_fallback" | "mixed" | "unavailable";
  elevationGainMeters?: number;
  downhillMeters?: number;
};

export type NoveltySignal = {
  id: string;
  label: string;
  exposureType: "mileage" | "duration" | "long_run" | "cardio_load" | "fast_running" | "elevation" | "hard_day_clustering" | "run_frequency";
  severity: RiskSeverity;
  confidence: RiskConfidence;
  currentValue: number;
  baselineValue: number;
  absoluteChange: number;
  relativeRatio?: number;
  unit: string;
  source: SignalSource;
  message: string;
};

export type DecisionRiskContext = {
  scope: "observed" | "planned" | "planned_vs_observed";
  observedWindowDays: number;
  plannedWorkoutAvailable: boolean;
  plannedWorkout?: PlannedWorkoutExposure;
  painFatigueInjuryFlagsAvailable: boolean;
  recommendationUse: "llm_context";
};

export type PlannedWorkoutExposure = {
  source: "trainingtweaks_generated_plan" | "imported_plan" | "manual_plan" | "integration" | "unknown";
  date?: string;
  type?: TrainingPlanWorkoutType;
  targetMiles?: number;
  durationMinutes?: number;
  intensity?: TrainingPlanWorkout["intensity"];
  purpose?: string;
  confidence: RiskConfidence;
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
    capacityContext: RiskRuleConfig;
    adaptationContext: RiskRuleConfig;
    cardioLoad: RiskRuleConfig;
    mechanicalExposure: RiskRuleConfig;
    novelty: RiskRuleConfig;
    decisionRisk: RiskRuleConfig;
    plannedVsObservedDecisionRisk: RiskRuleConfig;
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
  runnerTensionSnapshot?: RunnerTensionSnapshot;
  decisionTrace?: DecisionTrace;
  recommendationFulfillmentTrace?: RecommendationFulfillmentTrace;
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
  runnerTensionModel?: RunnerTensionModel;
  modelRuns?: StoredModelRun[];
  stravaWebhookEvents?: StravaWebhookEvent[];
  lastRefreshAt?: string;
};

export type StravaWebhookEventStatus = "pending" | "ignored" | "processed" | "failed";

export type StravaWebhookEventKind =
  | "activity_sync"
  | "activity_delete"
  | "athlete_deauthorization"
  | "unknown";

export type StravaWebhookEvent = {
  id: string;
  provider: "strava";
  objectType: string;
  objectId: number;
  aspectType: string;
  ownerId: number;
  subscriptionId: number;
  eventTime: number;
  updates: Record<string, unknown>;
  receivedAt: string;
  status: StravaWebhookEventStatus;
  attempts: number;
  eventKind: StravaWebhookEventKind;
  processedAt?: string;
  failedAt?: string;
  ignoredAt?: string;
  failureReason?: string;
  ignoredReason?: string;
  matchedUserId?: string;
  lastAttemptAt?: string;
};

export type RunnerTensionId =
  | "health_protection_vs_performance_ambition"
  | "plan_adherence_vs_reality_adaptation"
  | "consistency_momentum_vs_recovery_rest"
  | "ambition_identity_vs_current_evidence"
  | "structure_guidance_vs_flexibility_autonomy"
  | "short_term_relief_vs_long_term_goal";

export type RunnerTensionSide = "left" | "right";

export type TensionEvidenceSource =
  | "explicit_user"
  | "manual_seed"
  | "scenario_fixture"
  | "question_history"
  | "recommendation_trace"
  | "observed_behavior"
  | "observed_outcome"
  | "manual_admin";

export type TensionEvidenceConfidence = "low" | "medium" | "high";

export type TensionEvidenceEvent = {
  id: string;
  tensionId: RunnerTensionId;
  side: RunnerTensionSide;
  source: TensionEvidenceSource;
  confidence: TensionEvidenceConfidence;
  amplitude: number;
  summary: string;
  createdAt: string;
  decayModelVersion: string;
  metadata?: Record<string, unknown>;
};

export type RunnerTensionModel = {
  schemaVersion: "1";
  evidence: TensionEvidenceEvent[];
};

export type RunnerTensionPosture = {
  tensionId: RunnerTensionId;
  leftLabel: string;
  rightLabel: string;
  leftWeight: number;
  rightWeight: number;
  net: number;
  confidence: "none" | "low" | "medium" | "high";
  leaning: "left" | "right" | "mixed" | "unknown";
  strongestEvidence: Array<{
    side: RunnerTensionSide;
    source: TensionEvidenceSource;
    effectiveWeight: number;
    summary: string;
    createdAt: string;
  }>;
};

export type RunnerTensionSnapshot = {
  schemaVersion: "1";
  asOf: string;
  decayModelVersion: string;
  postures: RunnerTensionPosture[];
};

export type DecisionTensionTrace = {
  tensionId: RunnerTensionId;
  recommendedSide: RunnerTensionSide;
  alternativeSide?: RunnerTensionSide;
  discouragedSide?: RunnerTensionSide;
  rationale?: string;
};

/**
 * @deprecated RecommendationFulfillmentTrace supersedes DecisionTrace for expected-vs-actual recommendation review.
 * Keep this only for compatibility with older stored model runs.
 */
export type DecisionTrace = {
  schemaVersion: "1";
  id: string;
  createdAt: string;
  question: string;
  recommendedActionSummary?: string;
  tensionTraces: DecisionTensionTrace[];
  runnerTensionSnapshot: RunnerTensionSnapshot;
  expectedExposure?: unknown;
  actualExposure?: unknown;
  actualAlignment?:
    | "unknown"
    | "exact"
    | "directionally_aligned"
    | "accepted_alternative"
    | "chose_opposite_side"
    | "ignored";
};

export type RecommendationIntent =
  | "long_run"
  | "easy_run"
  | "recovery_run"
  | "workout"
  | "rest"
  | "cross_train"
  | "delay_decision"
  | "adjust_week"
  | "unknown";

export type ScheduleTolerance =
  | "same_day"
  | "next_day"
  | "same_training_week"
  | "same_microcycle"
  | "flexible"
  | "unknown";

export type RecommendedExposure = {
  targetMiles?: number;
  minMiles?: number;
  maxMiles?: number;
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  intensity?: "off" | "easy" | "moderate" | "hard";
  avoidIntensity?: boolean;
  notes?: string;
};

export type ActualFulfillment =
  | "unknown"
  | "fulfilled"
  | "shifted_but_aligned"
  | "modified_but_aligned"
  | "accepted_alternative"
  | "chose_opposite_side"
  | "skipped"
  | "not_enough_data";

export type RecommendationFulfillmentTrace = {
  schemaVersion: "1";
  id: string;
  createdAt: string;
  question: string;
  recommendedActionSummary?: string;
  targetIntent: RecommendationIntent;
  expectedExposure?: RecommendedExposure;
  acceptableSubstitutions?: string[];
  scheduleTolerance?: {
    type: ScheduleTolerance;
    latestDate?: string;
    notes?: string;
  };
  notAlignedIf?: string[];
  tensionTraces: DecisionTensionTrace[];
  runnerTensionSnapshot: RunnerTensionSnapshot;
  expectedRiskContext?: unknown;
  actualExposure?: unknown;
  actualFulfillment?: ActualFulfillment;
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
