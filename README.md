# TrainingTweaks

TrainingTweaks is a chat-first running decision assistant that helps a self-coached runner adapt an existing training plan when real life disrupts it.

It does not generate a full training plan. It helps answer: given recent training, goals, constraints, and how the runner feels today, what are the reasonable options and tradeoffs?

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
- Paste optional plan, goal, and subjective context.
- Require configured user login before exposing the app or API routes.
- Ask a running adaptation question in chat.
- Receive a direct recommendation grounded in doctrine, context, recent training, and the user's current constraints.
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

TrainingTweaks stores tokens, activities, saved context, and model run logs in per-user JSON app state.

For Vercel or mobile-access deployments, set `DATABASE_URL` to your Supabase Postgres connection string. The app will create the `trainingtweaks_app_state` table automatically on first read/write. Each user gets a separate JSON app state row keyed as `user:<id>`.

If no database is configured, the app falls back to local JSON files under `.data/users/<user-id>/trainingtweaks.json`. This is intended for local development, not production persistence.

Schema changes are tracked in [supabase/migrations](supabase/migrations). The current migration creates the single JSON-backed app state table used by the MVP.

Chat requests append model run records to the same app state, whether backed by local JSON or Supabase/Postgres JSONB. Each record stores the question, training context, structured running context, model, OpenAI request body, raw response, rendered answer, model-call error details when applicable, and optional user feedback. The app keeps the latest 100 runs to prevent unbounded local state growth, and API keys or auth tokens are not stored in these records.

Recent retained runs can be inspected with `GET /api/model-runs`; pass `?limit=10` to change the default response size. Use `GET /api/model-runs?export=json` to download all retained model runs as JSON for prompt review or eval set development. Use `PATCH /api/model-runs` with a model run id, `positive` or `negative` rating, and optional note to save feedback.

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
