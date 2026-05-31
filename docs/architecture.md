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

- weekly mileage
- monthly mileage
- pace trends
- consistency metrics
- PR history
- long run progression
- workout counts

No LLM involvement.

### Layer 2: Risk Layer

Responsible for deterministic risk detection.

Examples:

- overtraining indicators
- undertraining indicators
- workload spikes
- long run progression risk
- workout density risk
- insufficient recovery

Outputs structured risk signals.

Example:

```json
{
  "overtrainingRisk": "moderate",
  "rampRate": "elevated",
  "recovery": "normal"
}
```

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

### Plan Context

Existing training plan.

Initially:

- pasted text
- uploaded documents

Future:

- structured plan parsing

### Decision

Core system object.

Fields:

- timestamp
- question
- context snapshot
- recommendation
- alternatives
- confidence
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
