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
  elevationGainMeters?: number;
  perceivedEffort?: number;
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
  longestRunLast14DaysMiles: number;
  longestRunLast28DaysMiles: number;
  recentIntensityIndicators: string[];
  recentMissedDays: number;
  runCountLast14Days: number;
  runCountLast28Days: number;
};
