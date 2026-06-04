# TrainingTweaks Economics

## Philosophy

Economics matter.

The system should prefer deterministic computation over model calls whenever practical.

Every piece of information generated without an LLM is cheaper, faster, more reliable, and easier to test.

## Expected Scale

Initial scale:

- 1 user
- 1 Strava account
- 1-10 questions per day
- 5 years of historical activity data

This scale is effectively free.

## Strava Costs

Current cost:

- $0

Primary constraint:

- API rate limits

Strategy:

- Import activities once.
- Incrementally refresh.
- Avoid re-fetching unchanged history.

## OpenAI Costs

OpenAI should only be used for recommendation generation.

Do not use OpenAI for:

- mileage calculations
- training load calculations
- statistical summaries
- risk calculations
- activity normalization

Use OpenAI for:

- tradeoffs
- recommendations
- judgment
- explanation

## Context Strategy

Never send raw activity history when summaries will suffice.

Preferred context:

- recent training summary
- current load metrics
- plan context
- goal context
- risk signals
- runner profile

Avoid:

- thousands of raw activities
- unnecessary historical detail

## Storage Costs

Current storage requirements are extremely small.

Even thousands of activities, years of history, and hundreds of decisions represent negligible storage usage.

Expected storage cost:

- approximately zero

## Hosting Costs

Development:

- local laptop
- $0

Production:

- Vercel
- Supabase
- approximately $0-10/month early stage

## Future Cost Risks

The largest future risk is unnecessary AI usage.

Bad pattern:

```text
Every refresh -> Re-analyze entire training history -> Generate embeddings -> Recompute AI summaries
```

Good pattern:

```text
Refresh activities -> Update deterministic metrics -> Generate AI response only when user asks a question
```

The system should remain event-driven rather than continuously AI-driven.

## Economic Rules

- Prefer SQL over AI.
- Prefer cached results over recomputation.
- Prefer summaries over raw data.
- Prefer incremental updates over full refreshes.
- Call the LLM only when judgment is required.
- If a feature can be implemented with deterministic logic and produces equivalent user value, deterministic logic should win.
