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

When recommending a workout, TrainingTweaks should anchor recommendations to the user's existing plan, stated goal, and established training pattern. It should not invent training structure from scratch.

## Decision Support, Not Authority

TrainingTweaks provides recommendations. The runner makes decisions.

The product should surface:

- recommendation
- alternatives
- tradeoffs
- assumptions
- risks
- confidence

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

## Success Metric

Success is achieved when the runner naturally chooses TrainingTweaks as the easiest way to answer training questions.

The user should stop needing giant ChatGPT prompts, Reddit threads, blog research, and forum debates. TrainingTweaks should become the default place where training decisions are made.
