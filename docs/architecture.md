# TrainingTweaks Architecture

## Overview

TrainingTweaks is a decision-support system for self-coached runners.

The architecture separates facts, risk, and judgment. This separation improves cost, testability, reliability, and explainability.

## Architecture Layers

### Layer 1: Fact Layer

Responsible for deterministic calculations.

Inputs:

- Strava activities
- user goals
- training plan context
- runner profile

Outputs:

- normalized activity facts
- rolling mileage, duration, long-run, elevation, HR, effort, and pace facts
- raw Strava stream data and stream summaries for running activities where feasible
- PR and best-effort history when available

No LLM involvement.

### Layer 2: Risk Layer

Responsible for deterministic risk detection.

The original risk layer was scaffolding. The source of truth is the load/risk framework:

- capacity context
- adaptation context
- cardio load
- mechanical exposure
- novelty signals
- decision risk findings

Decision risk is the output exposed to the judgment layer. It should reconcile recent reality, planned work, and structured subjective flags when available.

The risk layer should prefer clean observable signals over old static proxy metrics. If an old rule maps cleanly to the framework, reuse its implementation. If it only kind of maps, replace it.

For the current single-user product, stream sync should optimize for signal quality. Fetch and store streams broadly for authenticated running history, with resumable/idempotent metadata for fetched, failed, unavailable, rate-limited, and not-attempted states. Keep selective enrichment as a future mode for multi-user scaling or rate-limit pressure.

No LLM involvement.

### Layer 3: Judgment Layer

Responsible for recommendations.

Inputs:

- user question
- fact layer outputs
- risk layer outputs
- runner preferences
- plan context
- goal context

Outputs:

- recommendation
- alternatives
- tradeoffs
- confidence
- assumptions
- signals to monitor

Uses OpenAI.

## Data Flow

```text
User
-> Strava OAuth
-> Activity Import
-> Activity Normalization
-> Stream Sync
-> Derived Exposure Metrics
-> Capacity / Adaptation / Novelty Framework
-> Fact Layer
-> Risk Layer
-> Context Builder
-> OpenAI
-> Recommendation
-> User Action
-> Observed Strava Activity
-> Outcome Tracking
-> Runner Memory
```

## Primary Entities

### Activity

Normalized workout data. Provider-neutral.

Current provider:

- Strava

Future providers:

- Garmin
- Coros
- Polar

### Runner Profile

Durable preferences and goals.

Examples:

- race goals
- injury tolerance
- training philosophy
- decision tendencies

### Runner Tension Model

Runner Doctrine was the umbrella concept for runner-specific decision memory. Runner Tension Model is the concrete v1 data model for the runner's durable tradeoff posture.

It stores raw evidence events, not a permanent current label. Each event has a tension id, side, source, confidence, amplitude, summary, creation time, and decay model version. Current posture is computed on demand with exponential decay.

V1 tensions:

- health/protection vs performance/ambition
- plan adherence vs reality adaptation
- consistency/momentum vs recovery/rest
- ambition/identity vs current evidence
- structure/guidance vs flexibility/autonomy
- short-term relief vs long-term goal

Stated position and revealed behavior remain conceptually separate. Mismatch is preserved as signal for future confirmation rather than overwritten.

### Plan Context

Existing training plan.

Valid sources:

- TrainingTweaks-generated baseline plan
- imported plan
- manually entered plan
- future integrations

All plan sources should compile into the same canonical planned-workout representation. A generated plan is a starting hypothesis that gives the decision engine a planned future to tweak, not a sacred training philosophy.

### Decision

Core system object.

Fields:

- timestamp
- question
- context snapshot
- runner tension snapshot
- risk signals
- recommendation
- intended recommendation direction
- alternatives
- confidence
- explicit feedback
- adherence classification
- user action
- outcome

Most future product functionality should be evaluated through the lens of improving decision quality.

## Storage Boundaries

### External Systems

- Strava API
- OpenAI API

Future:

- Weather API
- Garmin API

### Local Storage

`.data/trainingtweaks.json`

Single-user mode.

### Production Storage

Supabase Postgres.

Stores:

- activities
- profile
- decisions
- recommendation history
- feedback loop data

## Design Principles

- Deterministic before AI.
- Minimize user effort.
- Recommendations over analytics.
- Decisions over activities.
- Learn from outcomes.
