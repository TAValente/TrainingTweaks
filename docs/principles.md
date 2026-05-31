# TrainingTweaks Principles

These principles guide product and engineering decisions when tradeoffs are unclear.

If a proposed feature violates these principles, it should face a high burden of proof.

## 1. Decisions Over Activities

TrainingTweaks is a decision product.

Activities are inputs. Plans are inputs. Goals are inputs. The product exists to help runners decide what to do next.

When evaluating a feature, ask: does this help the runner make a better decision? If not, reconsider building it.

## 2. Adapt Plans, Do Not Create Them

TrainingTweaks interprets and adapts an existing training philosophy. It does not invent one.

The system should act like an assistant coach who understands the runner's plan, not a head coach creating one from scratch.

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
