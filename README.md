# TrainingTweaks

TrainingTweaks is a chat-first running decision assistant that helps a self-coached runner adapt a plan when real life disrupts it.

It is not primarily a training plan generator, but it can generate a simple baseline plan so the app has a planned future to tweak. It helps answer: given recent training, goals, constraints, the plan, and how the runner feels today, what are the reasonable options and tradeoffs?

## Product Doctrine

TrainingTweaks is organized around decisions, not activities or plans. Activities, plans, and goals are inputs; the core output is an actionable recommendation that helps the runner make an informed choice.

The repo keeps the product doctrine in [docs](docs):

- [Doctrine](docs/doctrine.md)
- [Principles](docs/principles.md)
- [Architecture](docs/architecture.md)
- [Economics](docs/economics.md)
- [Roadmap](docs/roadmap.md)

Key engineering rule: deterministic systems should calculate facts and risk signals before any LLM call. The LLM should handle judgment, tradeoffs, uncertainty, prioritization, and explanation.

## MVP

- Connect Strava locally with OAuth.
- Store Strava access and refresh tokens in per-user JSON app state.
- Refresh recent Strava activities.
- Normalize activities into a provider-neutral internal model.
- Pull up to five years of Strava activity history.
- Incrementally enrich run activities with Strava detailed best efforts.
- Show a compact recent activity summary.
- Select a known plan family such as Hal Higdon, Jack Daniels, Pfitzinger, Hansons, NRC, FIRST, McMillan, generic, or custom.
- Store structured plan context when a runner-provided plan has been imported.
- Paste optional plan, goal, and subjective context.
- Require configured user login before exposing the app or API routes.
- Ask a running adaptation question in chat.
- Receive a direct recommendation grounded in doctrine, context, recent training, and the user's current constraints.
- Compute deterministic load/risk findings from capacity, adaptation, cardio load, mechanical exposure, novelty, and decision risk.
- Persist recent model runs for later prompt review and evaluation.
- Save lightweight answer feedback for retained model runs.

## Caveat

TrainingTweaks is a personal decision-support tool. It does not provide medical advice, diagnose injuries, or replace a coach. The user makes all training decisions. Strava integration is used only to display and reason over the authenticated user’s own activity data.

## Tech Stack

- Next.js App Router
- TypeScript
- Per-user JSON app state
- Supabase/Postgres storage when `DATABASE_URL` is configured
- Local JSON storage fallback for development when no database is configured
- Strava API
- OpenAI Responses API

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```bash
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
NEXTAUTH_SECRET=
AUTH_SECRET=
APP_PASSWORD=
APP_USER_EMAIL=
APP_USER_ID=
APP_USERS_JSON=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
APP_BASE_URL=http://localhost:3000
DATABASE_URL=
```

`AUTH_SECRET` signs the long-lived session cookie; `NEXTAUTH_SECRET` is used as a fallback if `AUTH_SECRET` is not set.

For the current single-user setup, set `APP_USER_EMAIL` and `APP_PASSWORD`. `APP_USER_ID` is optional; if omitted, the normalized email address is used as the stable user id.

For multiple configured users, set `APP_USERS_JSON` instead:

```json
[
  { "id": "runner-a", "email": "runner-a@example.com", "password": "strong-password-a" },
  { "id": "runner-b", "email": "runner-b@example.com", "password": "strong-password-b" }
]
```

The cookie lasts 180 days, so local and Vercel preview sessions stay signed in unless the browser cookie is cleared, the deployment host changes, or `AUTH_SECRET` changes.

This workspace also supports `local.env` for local-only secrets because the original project used that filename.

## App State Storage

TrainingTweaks stores tokens, activities, saved context, structured plan context, and model run logs in per-user JSON app state.

For Vercel or mobile-access deployments, set `DATABASE_URL` to your Supabase Postgres connection string. The app will create the `trainingtweaks_app_state` table automatically on first read/write. Each user gets a separate JSON app state row keyed as `user:<id>`.

If no database is configured, the app falls back to local JSON files under `.data/users/<user-id>/trainingtweaks.json`. This is intended for local development, not production persistence.

Schema changes are tracked in [supabase/migrations](supabase/migrations). The current migration creates the single JSON-backed app state table used by the MVP.

Chat requests append model run records to the same app state, whether backed by local JSON or Supabase/Postgres JSONB. Each record stores the question, training context, structured running context, model, OpenAI request body, raw response, rendered answer, model-call error details when applicable, and optional user feedback. The app keeps the latest 100 runs to prevent unbounded local state growth, and API keys or auth tokens are not stored in these records.

Recent retained runs can be inspected with `GET /api/model-runs`; pass `?limit=10` to change the default response size. Use `GET /api/model-runs?export=json` to download all retained model runs as JSON for prompt review or eval set development. Use `PATCH /api/model-runs` with a model run id, `positive` or `negative` rating, and optional note to save feedback. Feedback writes are verified by reading the retained run back after persistence.

## Deterministic Load/Risk Framework

TrainingTweaks computes V1 load/risk findings with a parameterized framework in `src/lib/risk.ts`. The original risk layer was scaffolding; the source of truth is now:

- capacity: historical ability and running background
- adaptation: current preparedness from recent observed training
- cardio load: internal strain, using Strava relative effort when available
- mechanical exposure: distance, duration, long runs, fast running, elevation, and stream-derived signals when available
- novelty: unusual exposure versus current adaptation
- decision risk: decision-facing findings for the recommendation engine

The data flow is raw Strava activity data -> normalized activity facts -> derived exposure metrics -> capacity/adaptation/novelty/risk framework -> recommendation. Findings are included in `/api/state`, Strava refresh responses, the main UI sidebar, and the structured running context sent to the model.

For the current single-user product, Strava refresh also syncs activity streams broadly for running activities where feasible. Stream sync is resumable across refreshes because each activity stores stream metadata for fetched, failed, unavailable, rate-limited, or not-attempted states. Use `STRAVA_STREAM_SYNC_MODE=full` for the current default, `selective` for future candidate-only enrichment, or `off` to disable stream sync. `STRAVA_STREAM_SYNC_LIMIT` caps stream requests per refresh.

## Structured Training Plans

Structured plan data is stored inside the existing per-user app state JSON. The current schema represents runner-provided imported plans as weeks, days, workout types, mileage or duration targets, intensity, and purpose. Named plan families are treated as metadata and adaptation guidance unless the user supplies their own plan details.

TrainingTweaks also includes a deterministic generic marathon scaffold generated from current miles per week, target or max miles per week, plan length, and low/regular/high risk tolerance. This is a baseline plan source feeding planned-vs-observed decision risk, not a separate coaching philosophy. Risk tolerance is parameterized as a planned-risk budget: low allows no scheduled yellow or red findings, regular allows limited yellow findings and no red findings, and high allows more yellow findings with a small red allowance. The starter marathon generator only schedules recovery runs, workout placeholders, and long runs for now; workout details are intentionally left to be chosen later.

The Plan tab lets a runner generate a starter plan, anchor it to a real calendar start date, and review each week with expected load, intensity, durability, and day-by-day workouts.

This keeps the app ready for plan-aware projections while avoiding app-shipped copies of popular published programs. The intended third-party path is bring-your-own-plan import, while TrainingTweaks-authored generic plans can be designed collaboratively inside the product.

Use the Supabase session pooler connection string if your network or deploy target does not support direct IPv6 database connections.

If the connection URL is fussy, you can set separate Postgres variables instead. These take priority over `DATABASE_URL`:

```bash
POSTGRES_HOST=aws-1-us-west-2.pooler.supabase.com
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
POSTGRES_USER=postgres.behomboexzgpjgdbaudk
POSTGRES_PASSWORD=
```

`STRAVA_DETAIL_SYNC_LIMIT` controls how many run activities are enriched with detailed Strava best-effort data per refresh. The default is `30`, which keeps Vercel requests from trying to fetch years of detailed runs in one shot.

`STRAVA_STREAM_SYNC_MODE` controls stream enrichment. The current default is `full` because TrainingTweaks is a single-user product and fast-running exposure is a core signal. `STRAVA_STREAM_SYNC_LIMIT` controls how many run stream requests are attempted per refresh; repeat refreshes continue from activities that have not yet fetched streams.

## Vercel Auth and Preview

Set `APP_USER_EMAIL`, `APP_PASSWORD`, and `AUTH_SECRET` in both Production and Preview environments. Use the same Supabase/Postgres environment variables in Preview if you want preview deployments to read and write the same saved Strava data, plan context, goals, and chat context.

You can generate a local secret in PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Use a stable production `APP_BASE_URL` for Strava OAuth. Preview URLs change, so Strava login is most reliable against production or any custom domain configured in Strava.

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Strava OAuth

In the Strava API application settings, set the callback domain to the host portion of `APP_BASE_URL`.

For local development:

```bash
APP_BASE_URL=http://localhost:3000
```

The app redirects to:

```text
http://localhost:3000/api/strava/callback
```

For Vercel production:

```bash
APP_BASE_URL=https://your-project.vercel.app
```

Then set the Strava callback domain to:

```text
your-project.vercel.app
```

If `APP_BASE_URL` is omitted, the app will try Vercel's system URL environment variables. For Strava, an explicit stable production `APP_BASE_URL` is still recommended because preview deployment URLs change.

## Routes

- `/` main chat UI
- `/model-runs` model run review UI
- `/api/strava/auth` redirects to Strava OAuth
- `/api/strava/callback` exchanges the authorization code for tokens
- `/api/strava/refresh` refreshes tokens if needed and imports recent activities
- `/api/chat` builds structured running context and calls the AI
- `/api/model-runs` returns or exports retained model run logs
- `/api/state` returns local app state for the UI
- `/login` authenticates configured TrainingTweaks users

## Internal Activity Model

```ts
type Activity = {
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
```

## Limitations

- Single-user password gate only; there are no separate user accounts or roles.
- No persistent long-term memory beyond saved activities and context.
- No uploaded plan parsing yet.
- No weather integration yet.
- No Garmin integration yet.
- Injury handling is limited to risk flag reasoning from user-provided notes.
