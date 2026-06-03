# TrainingTweaks Doctrine

## Mission

TrainingTweaks exists to help runners make better training decisions with less effort.

The product is not a coach, a training plan generator, or an activity tracker.

The product exists to answer:

> Given my goals, training history, plan, constraints, and how I feel today, what should I do?

## Core Product Philosophy

Most running software is organized around activities. Most coaching software is organized around plans.

TrainingTweaks is organized around decisions.

Activities are inputs. Plans are inputs. Goals are inputs. The output is a recommendation that helps the runner make a decision.

The primary object in the system is **Decision**, not Activity, Workout, or Plan.

## Product Boundary

TrainingTweaks interprets and adapts an existing training philosophy. TrainingTweaks does not create a training philosophy.

In scope:

- I missed yesterday's workout. What should I do?
- I am traveling this week. How should I adjust?
- My plan says 8 miles but I am unusually fatigued.
- Should I run today?
- Am I overreaching?
- Am I undertraining?
- What are the tradeoffs of skipping this workout?

Out of scope:

- Build me a marathon plan.
- Design a 16-week training cycle.
- Create a coaching philosophy.
- Replace a human coach.
- Resolve obvious non-training boundary conditions such as dangerous weather, medical emergencies, or clear safety issues.

When recommending a workout, TrainingTweaks should anchor recommendations to the user's existing plan, stated goal, and established training pattern. It should not invent training structure from scratch.

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

- mileage summaries
- training load
- consistency metrics
- workout density
- ramp rates
- overtraining signals
- undertraining signals
- historical statistics

Use AI for:

- judgment
- tradeoffs
- uncertainty
- prioritization
- recommendation generation

The LLM should reason from facts. It should not calculate facts.

## Runner Memory

The system should learn durable decision preferences.

Examples:

- prefers consistency over workout quality
- injury-averse
- frequently travels
- often exceeds conservative recommendations
- prioritizes finishing goals over maximizing performance

The system should not accumulate data merely because it can. Memory must improve future decisions.

## Runner Doctrine

Each runner should have a small personal doctrine that TrainingTweaks can use to interpret ambiguous decisions.

Runner doctrine may include explicit beliefs:

- what matters most right now: protecting the build, sticking to the plan, or pushing an aggressive race goal
- how strongly the existing plan should be respected
- whether the runner tends to seek permission to skip or tends to push through warning signs
- how much short-term risk the runner is willing to accept
- training theories or rituals the runner wants honored

Runner doctrine may also include implicit tendencies inferred from repeated decisions and outcomes. Inferred doctrine should be treated carefully and surfaced as a hypothesis, not as an accusation or permanent label.

When the runner's current framing conflicts with their durable doctrine, TrainingTweaks should be willing to counterbalance. It should not rubber-stamp avoidance, and it should not enable overreach. The product should respect the runner as knowledgeable while holding them accountable to the priorities they have stated or demonstrated.

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
