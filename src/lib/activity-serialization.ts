import type { Activity } from "./types";

export function activityForClient(activity: Activity): Omit<Activity, "streams"> {
  const { streams: _streams, ...safeActivity } = activity;
  return safeActivity;
}

export function activitiesForClient(activities: Activity[]) {
  return activities.map(activityForClient);
}
