# TrainingTweaks Doctrine

## Mission

TrainingTweaks exists to help runners make better training decisions with less effort.

The product is not a coach or an activity tracker.

The product exists to answer:

> Given my goals, training history, plan, constraints, and how I feel today, what should I do?

## Core Product Philosophy

Most running software is organized around activities. Most coaching software is organized around plans.

TrainingTweaks is organized around decisions.

Activities are inputs. Plans are inputs. Goals are inputs. The output is a recommendation that helps the runner make a decision.

The primary object in the system is **Decision**, not Activity, Workout, or Plan.

## Product Boundary

TrainingTweaks interprets and adapts a training plan or training intent. TrainingTweaks may generate a simple baseline plan when the runner does not bring one, but plan generation exists to create something useful to tweak.

In scope:

- I missed yesterday's workout. What should I do?
- I am traveling this week. How should I adjust?
- My plan says 8 miles but I am unusually fatigued.
- Should I run today?
- Am I overreaching?
- Am I undertraining?
- What are the tradeoffs of skipping this workout?

Out of scope:

- Design a 16-week training cycle.
- Create a coaching philosophy.
- Replace a human coach.
- Resolve obvious non-training boundary conditions such as dangerous weather, medical emergencies, or clear safety issues.

When recommending a workout, TrainingTweaks should anchor recommendations to the user's plan, stated goal, and established training pattern. Valid plan sources include a TrainingTweaks-generated baseline plan, an imported plan, a manually entered plan, and future integrations. All plan sources should compile into the same canonical planned-workout representation.

A generated plan is a starting hypothesis, not sacred truth. TrainingTweaks is a plan adaptation and decision product, not primarily a training plan generator. Plan generation should remain simple, parameterized, explainable, and subordinate to the adaptation layer. Do not expand into elaborate branded training philosophies before planned-vs-observed decision risk is strong.

TrainingTweaks should not over-design edge cases where the answer is outside normal training judgment. If the user's situation is clearly unsafe or medical, the product should say so plainly and avoid turning it into a nuanced workout optimization problem.

## Decision Support, Not Authority

TrainingTweaks provides recommendations. The runner makes decisions.

The product may use these elements to support the recommendation:

- recommendation
- alternatives
- tradeoffs
- assumptions
- risks
- confidence

It should not surface all of them by default. A full structure can be useful for complex decisions, but many training questions need a direct answer, one or two reasons, and a concrete next action.

The goal is not certainty. The goal is informed judgment.

## Minimize User Effort

Minimize user effort before maximizing analytical sophistication.

Guidelines:

- Import everything automatically.
- Infer everything possible.
- Ask only for information that materially changes the recommendation.
- Prefer buttons and chips over text entry.
- Prefer one-click actions over workflows.
- Avoid forms whenever possible.

The ideal experience:

1. Open app.
2. Ask question.
3. Receive useful recommendation.

## Deterministic Before AI

Business logic should be deterministic whenever practical.

Use SQL, code, and calculations for:

- normalized activity facts
- capacity context
- adaptation context
- cardio load
- mechanical exposure
- novelty signals
- decision risk findings
- historical statistics that explain decisions

Use AI for:

- judgment
- tradeoffs
- uncertainty
- prioritization
- recommendation generation

The LLM should reason from facts. It should not calculate facts.

## Load And Risk Doctrine

The original risk layer was scaffolding. The source of truth is now:

- capacity: historical ability and running background
- adaptation: current preparedness from recent observed training
- cardio load: internal strain, with source and confidence
- mechanical exposure: musculoskeletal exposure from distance, duration, long runs, fast running, elevation, and streams when available
- novelty: how unusual current exposure is versus current adaptation
- decision risk: the decision-facing synthesis of adaptation, novelty, exposure, planned work, and pain/fatigue/injury signals when available

Capacity is not adaptation. A runner may have high historical capacity and low current adaptation. Detraining should emerge from adaptation context rather than a separate v1 decay model.

The data flow should be:

```text
Raw Strava activity data
-> normalized activity facts
-> derived exposure metrics
-> capacity/adaptation/novelty/risk framework
-> decision recommendation
```

Reuse raw data, not old interpretations. Old vague metrics are not parallel doctrine. Delete, rename, or demote old derived metrics when they do not cleanly support the framework. Metrics exist to support recommendations, not analytics dashboards.

For now, fetch and store Strava streams broadly for the authenticated user's running history where feasible. This is a single-user product, and fast-running exposure plus mechanical novelty are core signals. Store sync metadata so the system can distinguish fetched, failed, unavailable, rate-limited, and not-attempted streams. Keep no-stream fallback behavior for future non-stream users, but do not fake precise fast-running exposure when streams are absent.

## Runner Memory

The system should learn durable decision preferences.

Examples:

- prefers consistency over workout quality
- injury-averse
- frequently travels
- often exceeds conservative recommendations
- prioritizes finishing goals over maximizing performance

The system should not accumulate data merely because it can. Memory must improve future decisions.

## Runner Doctrine and Runner Tension Model

Runner Doctrine was the umbrella concept for runner-specific decision memory. Runner Tension Model is the concrete v1 implementation.

The Runner Tension Model is a runner-specific, decaying, evidence-backed model of how the runner tends to resolve recurring training tradeoffs. It is not a plan, static profile, diagnosis, personality label, or generic risk posture. It is a contextual layer for tradeoffs, ambiguity, framing, and recommendation posture.

V1 tracks a fixed set of binary tensions:

- health/protection vs performance/ambition
- plan adherence vs reality adaptation
- consistency/momentum vs recovery/rest
- ambition/identity vs current evidence
- structure/guidance vs flexibility/autonomy
- short-term relief vs long-term goal

Raw evidence events are the source of truth. Each event records a tension, side, source, confidence, amplitude, summary, creation time, and decay model version. Current posture is computed on demand from stacked decaying evidence, not stored as a permanent label.

Stated position and revealed behavior should be preserved separately conceptually. A mismatch is a core signal to surface and understand, not something to overwrite. For example, a runner may explicitly prioritize finishing healthy while sometimes choosing aggressive training risk; TrainingTweaks should preserve that tension rather than pretending one side cancels the other.

The tension model must not override hard evidence. It does not change mileage math, deterministic risk findings, or clear pain/injury/illness/safety boundaries. It should affect ambiguous tradeoffs, framing, and how strongly to push back or offer alternatives.

When the runner's current framing conflicts with their durable tension posture, TrainingTweaks should be willing to counterbalance. It should not rubber-stamp avoidance, and it should not enable overreach. The runner always decides; the app recommends, explains, and shows meaningful alternatives when appropriate.

## Friction Before Final Decision

Training decisions are often distorted by avoidable friction: getting dressed, finding shoes, leaving the house, deciding in the abstract, or negotiating with inertia.

By default, TrainingTweaks should feel comfortable recommending a low-commitment friction-reduction step before the final decision:

> Put on your running clothes and shoes, step outside, and then reassess. If the same concern still feels real after five minutes, adjust the run.

The posture is not "run no matter what." The posture is "move the decision point past avoidable friction." TrainingTweaks should start with this as a useful default, then adaptively retreat if explicit feedback or repeated behavior suggests a runner finds it annoying, unhelpful, or mismatched to their decision style.

## Recommendation Feedback Loop

TrainingTweaks should learn from:

```text
Decision -> Recommendation -> Actual Behavior -> Outcome
```

Example:

- Recommendation: Run 4 easy miles.
- Actual behavior: Ran 6 easy miles.
- Outcome: No negative consequence.

This information may improve future recommendations. The feedback loop is a core asset of the system.

Recommendation Fulfillment Trace is the bridge between a recommendation and later observed behavior. It records the workout intent, expected exposure bounds, acceptable substitutions or schedule shifts, not-aligned behavior, active tension traces, and the runner tension snapshot used at recommendation time.

Fulfillment is based on workout intent, not just a calendar observation window. If TrainingTweaks recommends a Sunday long run and the runner completes the same long-run intent on Monday, that may be shifted-but-aligned rather than skipped. Date tolerance can help future matching, but the core question is whether the intended training outcome happened in an aligned way.

Fulfillment Matching v1 deterministically compares stored Recommendation Fulfillment Traces against later Strava activities. It should be conservative: unknown intent stays unknown, ambiguous activities stay unknown, and shifted-but-aligned workouts should not be treated as skipped. Matching results do not update the Runner Tension Model yet; future work may use reviewed fulfillment results to propose tension evidence updates.

Feedback should combine explicit and inferred signals.

Explicit signals should be lightweight, such as thumbs up or thumbs down on a recommendation. These signals tell TrainingTweaks whether the advice felt useful, respectful, and appropriately calibrated.

Inferred signals should come primarily from training data. If TrainingTweaks recommends reducing a workout from 8 reps to 6 and the runner does 5 or 7, that is not simple non-compliance. It may mean the runner listened, accepted the adjustment principle, and made a reasonable game-time decision. The system should evaluate whether the recommendation influenced behavior, not merely whether it was followed exactly.

TrainingTweaks should distinguish:

- exact follow-through
- partial follow-through
- directionally aligned behavior
- ignored recommendation
- unknown outcome

Over time, this distinction should help the system learn which recommendation styles improve decisions without overfitting to one-off outcomes.

## Success Metric

Success is achieved when the runner naturally chooses TrainingTweaks as the easiest way to answer training questions.

The user should stop needing giant ChatGPT prompts, Reddit threads, blog research, and forum debates. TrainingTweaks should become the default place where training decisions are made.
