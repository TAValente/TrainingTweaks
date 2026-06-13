"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";

export type MockScenarioId =
  | "default"
  | "pain"
  | "schedule"
  | "great"
  | "checking"
  | "refreshed"
  | "no-run"
  | "strava-error";
type TweakId = "great" | "tired" | "sore" | "pain" | "schedule" | "behind";

type MockScenario = {
  id: MockScenarioId;
  label: string;
  tweak?: TweakId;
  recommendation: string;
  copy: string;
  receipt: string;
  rationale: string;
  evidence: string;
  status: string;
  swipeLine: string;
  tapHint: string;
};

const scenarios: Record<MockScenarioId, MockScenario> = {
  default: {
    id: "default",
    label: "Default",
    recommendation: "4 easy miles",
    copy: "Keep it conversational.",
    receipt: "Build: steady / Risk: low",
    rationale: "Recent load is workable. Keep the long run protected.",
    evidence: "Assignment: conversational / no speed / 35-45 min",
    status: "Today's path",
    swipeLine: "After your run, swipe to refresh",
    tapHint: "Why this call?"
  },
  pain: {
    id: "pain",
    label: "Pain",
    tweak: "pain",
    recommendation: "Rest or short walk",
    copy: "Pain noted. Staying on path means not forcing it.",
    receipt: "Build: protected / Risk: watch",
    rationale: "Pain changes the call. Don't force the day.",
    evidence: "Assignment: no run today / gentle walk ok / check tomorrow",
    status: "Today's path",
    swipeLine: "Swipe after any update",
    tapHint: "Why this call?"
  },
  schedule: {
    id: "schedule",
    label: "Schedule tight",
    tweak: "schedule",
    recommendation: "30 minutes easy",
    copy: "Keep the week alive.",
    receipt: "Build: adjusted / Risk: low",
    rationale: "Shrink the window, keep the workout intent.",
    evidence: "Assignment: time capped / conversational only / no makeup miles",
    status: "Today's path",
    swipeLine: "Swipe later if the day changes",
    tapHint: "Why this call?"
  },
  great: {
    id: "great",
    label: "Feeling great",
    tweak: "great",
    recommendation: "Still 4 easy miles",
    copy: "Great is useful. Spend it on consistency.",
    receipt: "Build: steady / Risk: low",
    rationale: "Good legs count most when they do not become surprise workouts.",
    evidence: "Assignment: keep it easy / save the pop / 35-45 min",
    status: "Today's path",
    swipeLine: "After your run, swipe to refresh",
    tapHint: "Why this call?"
  },
  checking: {
    id: "checking",
    label: "Checking",
    recommendation: "Checking Strava...",
    copy: "Looking for a new run. No update until one is confirmed.",
    receipt: "Refresh: checking / Plan unchanged",
    rationale: "No update until a new Strava activity is confirmed.",
    evidence: "Refresh: checking Strava / no result yet / plan unchanged",
    status: "Checking Strava",
    swipeLine: "Checking Strava...",
    tapHint: "Why this call?"
  },
  refreshed: {
    id: "refreshed",
    label: "Run found",
    recommendation: "Tomorrow stays rest",
    copy: "Nice. Today fit the plan.",
    receipt: "Build: absorbed / Risk: low",
    rationale: "Today fit the plan. The next step stays easy.",
    evidence: "Latest run 4.3 easy / assignment matched / tomorrow rest",
    status: "Updated",
    swipeLine: "Refreshed just now",
    tapHint: "Why this call?"
  },
  "no-run": {
    id: "no-run",
    label: "No run",
    recommendation: "No new run found",
    copy: "Your plan is unchanged. Try again after Strava syncs.",
    receipt: "Refresh checked / Plan unchanged",
    rationale: "No new Strava activity found.",
    evidence: "Checked Strava / no activity found / no update applied",
    status: "Refresh checked",
    swipeLine: "Try again",
    tapHint: "Why this call?"
  },
  "strava-error": {
    id: "strava-error",
    label: "Strava error",
    recommendation: "Couldn't reach Strava",
    copy: "Your plan is unchanged. Try again in a minute.",
    receipt: "Refresh paused / Plan unchanged",
    rationale: "Strava unavailable. No update applied.",
    evidence: "Strava unavailable / no update applied",
    status: "Refresh paused",
    swipeLine: "Try again",
    tapHint: "Why this call?"
  }
};

const tweakChips: Array<{ id: TweakId; label: string; scenario?: MockScenarioId }> = [
  { id: "great", label: "Feeling great", scenario: "great" },
  { id: "tired", label: "Low energy" },
  { id: "sore", label: "Sore" },
  { id: "pain", label: "Pain", scenario: "pain" },
  { id: "schedule", label: "Schedule tight", scenario: "schedule" },
  { id: "behind", label: "Behind plan" }
];

const scenarioTabs: MockScenarioId[] = [
  "default",
  "pain",
  "schedule",
  "great",
  "checking",
  "refreshed",
  "no-run",
  "strava-error"
];

const weekPath = [
  { day: "Today", call: "4 easy", state: "active" },
  { day: "Tomorrow", call: "Rest", state: "rest" },
  { day: "Saturday", call: "8 long", state: "long" }
];

export function TodayProductMockup({ initialState = "default" }: { initialState?: MockScenarioId }) {
  const [scenarioId, setScenarioId] = useState<MockScenarioId>(initialState);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const scenario = scenarios[scenarioId];
  const selectedTweak = scenario.tweak;
  const headerStatus =
    scenarioId === "refreshed"
      ? "Updated"
      : scenarioId === "checking"
        ? "Checking"
        : scenarioId === "no-run" || scenarioId === "strava-error"
          ? "Unchanged"
          : "Fresh 7:42 AM";

  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("state");
    const normalizedState = state === "refreshing" ? "checking" : state;
    if (isMockScenarioId(normalizedState)) setScenarioId(normalizedState);
  }, []);

  const optionalCopy = useMemo(() => {
    if (!selectedTweak) return "No tweak needed? Just run the plan.";
    if (selectedTweak === "pain") return "Adapt the run without trying to prove anything today.";
    if (selectedTweak === "schedule") return "Keep the workout intent and shrink the window.";
    if (selectedTweak === "great") return "Keep the assignment easy and spend the good legs on consistency.";
    return "No tweak needed? Just run the plan.";
  }, [selectedTweak]);

  function chooseTweak(tweak: TweakId, nextScenario?: MockScenarioId) {
    setScenarioId(nextScenario ?? "default");
    setIsWhyOpen(false);
  }

  function showScenario(id: MockScenarioId) {
    setScenarioId(id);
    setIsWhyOpen(false);
  }

  function handleHeroKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsWhyOpen(true);
    }
  }

  return (
    <main className="todayMockShell">
      <section className="todayMockDevPanel" aria-label="Dev mock states">
        <div>
          <p>Dev mock states</p>
          <h1>Today screen</h1>
        </div>
        <div className="todayMockScenarios">
          {scenarioTabs.map((id) => (
            <button
              className={scenarioId === id ? "active" : ""}
              key={id}
              onClick={() => showScenario(id)}
              type="button"
            >
              {scenarios[id].label}
            </button>
          ))}
        </div>
      </section>

      <section className="todayMockPhone" aria-label="TrainingTweaks Today mockup">
        <header className="todayMockHeader">
          <div>
            <p>Good morning</p>
            <strong>TrainingTweaks</strong>
          </div>
          <span>{headerStatus}</span>
        </header>

        <article
          className={`todayMockHero ${scenarioId}`}
          onClick={() => setIsWhyOpen(true)}
          onKeyDown={handleHeroKeyDown}
          role="button"
          tabIndex={0}
        >
          <div className="todayMockHeroImage" aria-hidden="true" />
          <div className="todayMockTapHint">
            <span>{scenario.tapHint}</span>
          </div>
          <div className="todayMockRouteIcon" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
          <p>{scenario.status}</p>
          <h2>{scenario.recommendation}</h2>
          <p className="todayMockHeroCopy">{scenario.copy}</p>
          <div className="todayMockReceipt" aria-label="Recommendation reasoning receipt">
            <strong>{scenario.receipt}</strong>
            <span>{scenario.rationale}</span>
          </div>
          <div className="todayMockEvidence">{scenario.evidence}</div>
          <div className="todayMockSwipe" aria-label="Swipe refresh affordance">
            <i aria-hidden="true" />
            <span>{scenario.swipeLine}</span>
          </div>
        </article>

        {isWhyOpen ? (
          <section className="todayMockWhySheet" aria-label="Why this call preview">
            <header>
              <div>
                <h3>Why this call?</h3>
                <p>A compact preview of the reasoning slot this screen can open later.</p>
              </div>
              <button onClick={() => setIsWhyOpen(false)} type="button">Close</button>
            </header>
            <div className="todayMockWhyList">
              <div>
                <strong>Plan fit</strong>
                <span>Today's call keeps the assigned workout intent intact.</span>
              </div>
              <div>
                <strong>Recent load</strong>
                <span>{scenario.rationale}</span>
              </div>
              <div>
                <strong>Risk/progress signal</strong>
                <span>{scenario.receipt}. The goal is to keep progress durable.</span>
              </div>
              <div>
                <strong>Long run protection</strong>
                <span>Preserve Saturday's 8 long unless the week changes.</span>
              </div>
              <div>
                <strong>What would change the call</strong>
                <span>Pain, a tighter schedule, or a matched run would update this slot.</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="todayMockTweakCard">
          <div className="todayMockSectionHeader">
            <h3>Considering a tweak today?</h3>
            <p>{optionalCopy}</p>
          </div>
          <div className="todayMockChips" aria-label="Optional tweak choices">
            {tweakChips.map((chip) => (
              <button
                className={selectedTweak === chip.id ? "active" : ""}
                key={chip.id}
                onClick={() => chooseTweak(chip.id, chip.scenario)}
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </section>

        <section className="todayMockWeek">
          <div className="todayMockSectionHeader">
            <h3>This week's path</h3>
            <p>Tap for schedule</p>
          </div>
          <div className="todayMockWeekPath" aria-label="Week outlook">
            {weekPath.map((item) => (
              <div className={item.state} key={item.day}>
                <span />
                <small>{item.day}</small>
                <strong>{item.call}</strong>
              </div>
            ))}
          </div>
        </section>

        <nav className="todayMockBottomNav" aria-label="Main">
          <a className="active" href="/dev/product-mockups/today">Today</a>
          <a href="/dev/product-mockups/today">Schedule</a>
          <a href="/dev/product-mockups/today">Progress</a>
        </nav>
      </section>
    </main>
  );
}

function isMockScenarioId(value: string | null): value is MockScenarioId {
  return (
    value === "default" ||
    value === "pain" ||
    value === "schedule" ||
    value === "great" ||
    value === "checking" ||
    value === "refreshed" ||
    value === "no-run" ||
    value === "strava-error"
  );
}
