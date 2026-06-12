# TrainingTweaks Principles

These principles guide product and engineering decisions when tradeoffs are unclear.

If a proposed feature violates these principles, it should face a high burden of proof.

## 1. Decisions Over Activities

TrainingTweaks is a decision product.

Activities are inputs. Plans are inputs. Goals are inputs. The product exists to help runners decide what to do next.

When evaluating a feature, ask: does this help the runner make a better decision? If not, reconsider building it.

## 2. Adapt Plans First

TrainingTweaks is a plan adaptation and decision product. It may generate a simple baseline plan when the runner does not bring one, because the app needs a planned future to intelligently tweak.

A generated plan is a starting hypothesis, not sacred truth. The system should support bring-your-own-plan without requiring it, and all plan sources should compile into the same canonical planned-workout representation.

Plan generation should remain simple, parameterized, and explainable. Do not expand into elaborate branded training philosophies before the adaptation layer is strong.

## 3. Minimize User Effort

User effort is a cost. Every click, form, upload, and text box should be justified.

The preferred order is:

1. Automatically import.
2. Automatically infer.
3. Ask with one tap.
4. Ask with structured input.
5. Ask with free-form text.

The best workflow is often the shortest workflow.

## 4. Deterministic Before AI

If a fact can be calculated, calculate it.

Do not ask an LLM to compute mileage, training load, ramp rates, workout counts, consistency metrics, or risk scores.

Use deterministic systems for facts. Use AI for judgment.

The deterministic load/risk framework is:

- capacity
- adaptation
- cardio load
- mechanical exposure
- novelty
- decision risk

Use raw activity inputs and derived exposure metrics for this framework. Do not preserve old derived metrics merely because they exist.

## 5. Judgment Is the Product

TrainingTweaks is not valuable because it stores data. TrainingTweaks is valuable because it helps interpret data.

The LLM should focus on tradeoffs, prioritization, uncertainty, and recommendations. The recommendation is the product.

## 6. Explain the Why

Recommendations should explain reasoning.

The runner should understand:

- why the recommendation exists
- what tradeoffs were considered
- what risks are being accepted
- what assumptions were made

Transparency builds trust.

## 7. Practical Beats Optimal

TrainingTweaks should optimize for real-world execution.

A theoretically perfect plan adjustment that a runner cannot execute is less valuable than a practical adjustment they can.

Real constraints matter:

- travel
- family obligations
- fatigue
- motivation
- schedule limitations

The recommendation should account for reality.

## 8. Learn From Outcomes

Recommendations should not disappear after they are delivered.

The system should observe:

```text
Decision -> Recommendation -> Actual Behavior -> Outcome
```

Future recommendations should improve from these observations.

## 9. Remember Preferences, Not Noise

Not all information deserves permanent memory.

Remember goals, constraints, tendencies, risk tolerance, and decision patterns.

Avoid storing information that does not improve future decisions. Memory should be intentional.

## 10. Ask Only When It Matters

Additional questions should only be asked if they meaningfully change the recommendation.

If the answer will be effectively the same regardless of user input, do not ask. Every question should earn its place.

## 11. One Question In, One Recommendation Out

The default interaction should be simple.

User:

> Should I run today?

System:

> Here's what I think and why.

The default answer should not be a comprehensive memo. If TrainingTweaks can make a useful call, it should make the call, explain the decisive reason, and give the next action. Balanced option lists are appropriate only when the choice genuinely depends on information the system lacks or when multiple options are meaningfully different.

Good answers often separate the easy call from the game-time decision.

Example:

> Easy call: run short and easy to keep the habit and get some miles. Hitting the planned mileage would be ideal, but an extra mile does not matter much for your stated goal; being miserable might.
>
> Game-time decision: if you still feel wrecked, pivot to a 20-minute walk. Missing tomorrow is redeemable, missing two days is a speed bump, and missing three before wedding travel risks turning disruption into a real setback. Do yourself the favor and get some miles in, but make the final call with your clothes and shoes on.

Complex workflows should be the exception, not the norm.

## 12. Context Is a Competitive Advantage

The value of TrainingTweaks comes from assembling the right context automatically.

The runner should not need to repeatedly explain goals, history, training plan, preferences, or recent training. The system should already know.

## 13. Recommendations Must Be Actionable

Avoid vague advice.

Bad:

> Listen to your body.

Better:

> Run 4 easy miles today, skip strides, and reassess soreness tomorrow morning.

Recommendations should result in a clear next action.

## 14. Favor Defaults and Chips Over Forms

Buttons beat forms. Chips beat text boxes. Selections beat typing.

Structured inputs improve speed, consistency, mobile usability, and recommendation quality.

## 15. Build for the User, Not the Market

TrainingTweaks is successful if it becomes the easiest way for its user to answer running questions.

The first benchmark is not commercial success.

The first benchmark is: would I rather ask TrainingTweaks than Reddit, Google, or a generic LLM?

If the answer is yes, the product is succeeding.

## 16. Counterbalance the Moment

The user may ask TrainingTweaks at moments when their immediate impulse is distorted by fatigue, dread, ambition, inertia, soreness, or frustration.

TrainingTweaks should compare the current question against the runner's durable tension posture, stated goals, plan style, recent training, and risk signals. Runner Doctrine is the umbrella concept; Runner Tension Model is the v1 implementation for recurring binary tradeoffs. When the moment conflicts with the runner's own priorities, the product should gently but clearly counterbalance.

This cuts both ways:

- If the user is looking for permission to skip without a strong reason, preserve the plan's intent.
- If the user is trying to force a workout through meaningful warning signs, protect the build.
- If the user has chosen an aggressive race posture, name the risk rather than pretending the aggressive choice is risk-free.

Respect the runner as an adult. Counterbalance is not scolding, cheerleading, or paternalism. It is decision support with a memory. The tension model should never override deterministic risk findings, pain/injury/illness/safety boundaries, or actual recent training evidence.

## 17. Reduce Friction Before Deciding

Some training decisions should not be made while the runner is still negotiating with avoidable friction.

TrainingTweaks may recommend a low-commitment action before a final decision, such as getting dressed, putting on shoes, stepping outside, packing running shoes, or warming up briefly. The point is to remove friction from the decision framework before judging the actual training question.

This should be a default product posture with adaptive retreat. If a runner dislikes it or repeatedly ignores it, TrainingTweaks should stop offering it as a default move.

## 18. Do Not Overthink Boundary Conditions

TrainingTweaks exists for training decisions. It should not turn obvious non-training boundary conditions into elaborate training debates.

If the situation is plainly unsafe, medical, or outside normal training judgment, TrainingTweaks should say so briefly and avoid optimizing the workout. These cases do not need a large decision framework; they need a clear boundary.
