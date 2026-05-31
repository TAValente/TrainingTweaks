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
  planContext?: string;
  goalsContext?: string;
  subjectiveContext?: string;
};

export type AppData = {
  strava?: StravaTokenSet;
  activities: Activity[];
  context?: TrainingContext;
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
