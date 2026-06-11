# TrainingTweaks Roadmap

This roadmap is organized around decision quality, not feature volume.

## 1. Deterministic Load/Risk Framework

Build the capacity/adaptation/exposure/novelty framework before expanding recommendation features.

Scope:

- capacity context from historical running background
- adaptation context from recent observed training
- cardio load with source and confidence
- mechanical exposure with source and confidence
- novelty signals versus current adaptation
- decision risk findings
- broad Strava stream sync for authenticated run history in the current single-user product
- missing-context signals that reduce confidence

Output structured risk signals for the judgment layer. The LLM should interpret these signals, not invent them from raw activity data.

## 2. Runner Tension Model

Runner Doctrine was the umbrella concept. Runner Tension Model is the concrete v1 implementation for durable tradeoff understanding.

Scope:

- fixed binary tensions with stable ids and human-readable labels
- raw evidence events as the source of truth
- exponential decay with versioned parameters
- current posture computed on demand from stacked decaying evidence
- stated position and revealed behavior preserved separately
- prompt rendering that contextualizes ambiguous tradeoffs without overriding deterministic risk findings

The model should help TrainingTweaks decide how convicted to be when the user's current impulse conflicts with their stated goals or revealed patterns. It should never become a permanent personality label.

## 3. Decision-Improvement Loop

Treat TrainingTweaks as a system for improving decisions, not merely generating plans or detecting risks.

The product should help runners establish a decision framework, apply it in real situations, observe what happened, and improve the framework over time.

A recommendation is not complete until the system can later compare:

- what was expected
- what was recommended
- what the runner did
- what happened afterward
- what should change next time

Persist decisions so recommendations and decision frameworks can be evaluated after the fact.

Scope:

- question
- context snapshot
- expectation or forecast
- risk signals
- recommendation
- decision framework or rule applied
- runner tension snapshot used
- intended recommendation direction
- actual behavior observed from Strava
- user feedback when available
- adherence classification: exact, partial, directionally aligned, ignored, unknown
- outcome notes
- suggested framework adjustment

This creates the loop:

```text
Expected -> Recommended -> Did -> Outcome -> Adjust
```

## 4. Feedback and Annoyance Detection

Learn whether recommendations are helping without adding heavy user burden.

Scope:

- one-tap feedback after answers
- infer question-history hints carefully
- compare recommendations to subsequent Strava behavior
- classify actual behavior as exact, directionally aligned, accepted alternative, chose opposite side, ignored, or unknown
- compare expected versus actual risk exposure
- store outcome evidence separately from observed behavior evidence
- surface meaningful tension mismatches to the runner
- ask the runner to confirm or reject important tension model updates
- add lightweight chips such as "yes, keep treating it this way" and "no, that's not right"
- detect whether friction-reduction advice increases execution
- detect whether repeated advice is ignored or disliked
- retreat from default friction-reduction advice when it appears annoying or unhelpful
- make tension model suggestions only after repeated evidence

Execution alone is not enough. A run completed after a suggestion may mean the advice worked, but it may also mean the user felt pressured. A workout that differs from the exact recommendation may still show that the advice helped. TrainingTweaks should measure behavioral influence, satisfaction, and repeated preference signals where practical.

Future: Runner Tension Reconciliation:

- trigger occasional check-ins at plan transitions, race completion, stale evidence, or repeated stated-vs-revealed mismatch
- ask whether the current tension model still matches the runner's go-forward posture
- let the runner confirm, revise, or retire stale tension assumptions
- store confirmations as explicit_user evidence with slow decay
- avoid frequent nagging; default to passive decay unless the mismatch materially affects recommendations

## 5. Plan Understanding

Move from pasted plan context toward structured plan interpretation.

Scope:

- start with a small, actionable library of known plan families and common variants
- support uploaded or pasted plan blocks
- identify planned workout intent
- distinguish quality, easy, long run, recovery, and rest days
- map plan prescriptions to expected weekly load, long-run progression, and workout density
- preserve the plan's style and aggressiveness

TrainingTweaks should adapt the user's plan. The plan may be imported, manually entered, generated by TrainingTweaks as a simple baseline, or supplied by a future integration. The generated baseline exists to create something useful to tweak.

## 6. Forward Projection and Option Comparison

Project deterministic progress and risk metrics forward so runners can compare reasonable choices before committing.

Scope:

- compile today's planned workout into planned exposure fields: target mileage, duration, intensity, workout type, and source
- compare planned exposure against current adaptation and novelty baselines
- estimate how one option versus another changes weekly load, acute/chronic load, long-run share, intensity density, and recovery spacing
- show whether a proposed option points toward de-training, productive, risky, or high-risk territory
- keep projections explainable and lightweight rather than pretending to forecast injury or fitness precisely
- use structured plans as the baseline once plan understanding is mature enough

TrainingTweaks should make tradeoffs visible: not just "what should I do today?", but "what does this choice make more likely over the next few days?"

The first bridge maps `structuredPlanSnapshot.plannedToday` into `PlannedWorkoutExposure`, passes it into the load/risk framework, and emits `decision_risk_planned_vs_observed` alongside the observed finding. The next step is option comparison: evaluate the user's proposed adjustment against the same adaptation and novelty baselines without building a full workout segment schema yet.

## 7. External Context

Add contextual signals that materially change recommendations.

Candidates:

- weather and heat
- race date proximity
- travel or schedule constraints
- sleep and soreness trends
- future Garmin or other provider integrations

These should be added only when they improve decisions enough to justify the extra complexity.

## 8. Managed Agent Workflow Consideration

Consider a managed agent or Agents SDK workflow only after logged model runs and feedback reveal failure modes that a single model call cannot reliably handle.

Potential uses:

- separate deterministic risk checking from final recommendation drafting
- add a review or guardrail step for injury, fatigue, or excessive-load recommendations
- orchestrate tools for weather, calendar, plan parsing, or post-run outcome checks
- produce traceable intermediate decisions for evals and debugging
- support human review gates before higher-risk advice patterns

Adoption criteria:

- the added steps measurably improve recommendation quality or safety
- eval data shows repeated failures from the current single-call architecture
- cost, latency, and operational complexity are justified by better decisions
- the workflow preserves the product principle that the runner decides

Default posture: keep the chat path as a simple deterministic context builder plus one model judgment call until evidence justifies agent orchestration.

## 9. Self-Service Authentication

Move beyond configured environment-variable users when TrainingTweaks is ready for broader use.

Scope:

- user signup and login
- password reset or magic-link recovery
- email verification
- per-user app state ownership
- account deletion and data deletion
- abuse controls so public signup cannot unexpectedly spend OpenAI or Strava API quota
- clear separation between authenticated users and admin-only operations

Likely path:

- prefer Supabase Auth or another mature auth provider over hand-rolled password storage
- keep the existing `user:<id>` app state keying as the storage boundary
- migrate configured users to provider-backed users once the auth provider is in place

Default posture: keep configured email/password users for the private MVP, but do not treat them as the long-term account system.
