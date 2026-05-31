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

Key engineering rule: deterministic systems should calculate facts and risk signals before any LLM call. The LLM should handle judgment, tradeoffs, uncertainty, prioritization, and explanation.

## MVP

- Connect Strava locally with OAuth.
- Store Strava access and refresh tokens in a local JSON file.
- Refresh recent Strava activities.
- Normalize activities into a provider-neutral internal model.
- Pull up to five years of Strava activity history.
- Incrementally enrich run activities with Strava detailed best efforts.
- Show a compact recent activity summary.
- Paste optional plan, goal, and subjective context.
- Ask a running adaptation question in chat.
- Receive a structured answer with recommendation, alternatives, tradeoffs, risk flags, assumptions, confidence, and signals to watch.

## Caveat

TrainingTweaks is a personal decision-support tool. It does not provide medical advice, diagnose injuries, or replace a coach. The user makes all training decisions. Strava integration is used only to display and reason over the authenticated user’s own activity data.

## Tech Stack

- Next.js App Router
- TypeScript
- Local JSON file storage in `.data/trainingtweaks.json`
- Supabase/Postgres storage when `DATABASE_URL` is configured
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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
APP_BASE_URL=http://localhost:3000
DATABASE_URL=
```

`NEXTAUTH_SECRET` is reserved for future auth hardening in this MVP; the current local-only version stores only the authenticated runner's Strava token set in `.data/trainingtweaks.json`.

This workspace also supports `local.env` for local-only secrets because the original project used that filename.

## Supabase Storage

For local laptop use, leaving `DATABASE_URL` blank stores data in `.data/trainingtweaks.json`.

For Vercel or mobile-access deployments, set `DATABASE_URL` to your Supabase Postgres connection string. The app will create the `trainingtweaks_app_state` table automatically on first read/write.

Schema changes are tracked in [supabase/migrations](supabase/migrations). The current migration creates the single JSON-backed app state table used by the MVP.

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
- `/api/strava/auth` redirects to Strava OAuth
- `/api/strava/callback` exchanges the authorization code for tokens
- `/api/strava/refresh` refreshes tokens if needed and imports recent activities
- `/api/chat` builds structured running context and calls the AI
- `/api/state` returns local app state for the UI

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

- Local single-user storage only.
- No persistent long-term memory beyond locally saved activities and context.
- No uploaded plan parsing yet.
- No weather integration yet.
- No Garmin integration yet.
- Injury handling is limited to risk flag reasoning from user-provided notes.
