# TODO

## Feasibility studies

- Plan self-service authentication.
  - Prefer Supabase Auth or another mature auth provider over hand-rolled password storage.
  - Decide whether signup should be open, invite-only, or admin-created to control API spend.
  - Include email verification, password reset or magic-link recovery, account deletion, and data deletion.
  - Preserve the existing per-user app state boundary keyed by `user:<id>`.
  - Define a migration path from configured env-var users to provider-backed users.

- Investigate whether TrainingTweaks should incorporate myTrainingForecast-style run health signals.
  - Review which metrics are useful for post-run health/status reporting.
  - Determine which data is available from Strava summaries, detailed activities, streams, and user-entered context.
  - Evaluate whether the app should write back to Strava activity descriptions, keep the analysis private, or offer both.
  - Identify required Strava scopes and privacy implications before implementation.
  - Define a small MVP, such as a private run health summary after refresh, before considering automatic Strava edits.
