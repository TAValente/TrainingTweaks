"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { trainingPlanProfiles } from "@/lib/training-plans";
import type { Activity, ActivitySummary, TrainingContext, TrainingPlanSource } from "@/lib/types";

type AppState = {
  connected: boolean;
  lastRefreshAt?: string;
  activities: Activity[];
  context?: TrainingContext;
  summary: ActivitySummary;
};

const emptySummary: ActivitySummary = {
  mileageLast7Days: 0,
  mileageLast14Days: 0,
  mileageLast28Days: 0,
  mileageLast42Days: 0,
  mileageLast84Days: 0,
  mileageLast182Days: 0,
  mileageLast730Days: 0,
  mileageLast1825Days: 0,
  longestRunLast14DaysMiles: 0,
  longestRunLast28DaysMiles: 0,
  longestRunLast182DaysMiles: 0,
  longestRunLast730DaysMiles: 0,
  longestRunLast1825DaysMiles: 0,
  recentIntensityIndicators: [],
  recentMissedDays: 0,
  runCountLast14Days: 0,
  runCountLast28Days: 0,
  runCountLast182Days: 0,
  runCountLast730Days: 0,
  runCountLast1825Days: 0,
  fastestEfforts: []
};

export default function Home() {
  const [state, setState] = useState<AppState>({
    connected: false,
    activities: [],
    summary: emptySummary
  });
  const [planSource, setPlanSource] = useState<TrainingPlanSource>("unknown");
  const [planVariant, setPlanVariant] = useState("");
  const [planContext, setPlanContext] = useState("");
  const [goalsContext, setGoalsContext] = useState("");
  const [subjectiveContext, setSubjectiveContext] = useState("");
  const [savedPlanSource, setSavedPlanSource] = useState<TrainingPlanSource>("unknown");
  const [savedPlanVariant, setSavedPlanVariant] = useState("");
  const [savedPlanContext, setSavedPlanContext] = useState("");
  const [savedGoalsContext, setSavedGoalsContext] = useState("");
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("Loading local training context...");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get("strava");
    const stravaReason = params.get("reason");
    if (stravaStatus === "error") {
      setError(stravaReason || "Strava connection failed.");
      setStatus("Strava connection failed.");
    } else if (stravaStatus === "denied") {
      setError(stravaReason ? `Strava authorization denied: ${stravaReason}` : "Strava authorization denied.");
      setStatus("Strava connection cancelled.");
    } else if (stravaStatus === "connected") {
      setStatus("Strava connected. Refresh activities next.");
    }
    loadState();
  }, []);

  async function loadState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      setError(payload.error ?? "Could not load app state.");
      setStatus("App state failed to load.");
      return;
    }

    const nextState = payload as AppState;
    setState(nextState);
    const nextPlanSource = nextState.context?.planSource ?? "unknown";
    const nextPlanVariant = nextState.context?.planVariant ?? "";
    const nextPlanContext = nextState.context?.planContext ?? "";
    const nextGoalsContext = nextState.context?.goalsContext ?? "";
    setPlanSource(nextPlanSource);
    setPlanVariant(nextPlanVariant);
    setPlanContext(nextPlanContext);
    setGoalsContext(nextGoalsContext);
    setSavedPlanSource(nextPlanSource);
    setSavedPlanVariant(nextPlanVariant);
    setSavedPlanContext(nextPlanContext);
    setSavedGoalsContext(nextGoalsContext);
    setSubjectiveContext(nextState.context?.subjectiveContext ?? "");
    setStatus(nextState.connected ? "Strava connected." : "Connect Strava to refresh activities.");
  }

  async function refreshStrava() {
    setIsRefreshing(true);
    setStatus("Refreshing Strava activities...");
    setError("");
    try {
      const response = await fetch("/api/strava/refresh", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Refresh failed.");

      setState((current) => ({
        ...current,
        connected: true,
        lastRefreshAt: payload.refreshedAt,
        activities: payload.activities,
        summary: payload.summary
      }));
      setStatus(`Imported ${payload.importedCount} recent Strava activities.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      setError(message);
      setStatus("Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function saveDurableContext(kind: "plan" | "goals") {
    setIsSavingContext(true);
    setError("");
    setStatus("Saving context...");

    try {
      const response = await fetch("/api/context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planSource,
          planVariant,
          planContext,
          goalsContext,
          subjectiveContext
        })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Context save failed.");

      setSavedPlanSource(planSource);
      setSavedPlanVariant(planVariant);
      setSavedPlanContext(planContext);
      setSavedGoalsContext(goalsContext);
      if (kind === "plan") setIsEditingPlan(false);
      if (kind === "goals") setIsEditingGoals(false);
      setStatus("Context saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Context save failed.";
      setError(message);
      setStatus("Context save failed.");
    } finally {
      setIsSavingContext(false);
    }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;

    setIsAsking(true);
    setStatus("Reasoning through the training tradeoffs...");
    setError("");
    setAnswer("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planContext,
          planSource,
          planVariant,
          goalsContext,
          subjectiveContext,
          question
        })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Chat request failed.");

      setAnswer(payload.answer);
      setStatus("Answer ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed.";
      setError(message);
      setStatus("Chat request failed.");
    } finally {
      setIsAsking(false);
    }
  }

  const runs = useMemo(
    () => state.activities.filter((activity) => activity.sportType.toLowerCase().includes("run")),
    [state.activities]
  );

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">TrainingTweaks</p>
          <h1>Adapt today&apos;s run without rewriting the whole plan.</h1>
        </div>
        <div className="actions">
          <a className="button secondary" href="/api/strava/auth">
            Connect Strava
          </a>
          <button className="button" onClick={refreshStrava} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh Strava Data"}
          </button>
        </div>
      </section>

      <section className="statusLine" aria-live="polite">
        <span className={state.connected ? "dot connected" : "dot"} />
        {status}
      </section>
      {error ? <section className="errorLine">{error}</section> : null}

      <section className="grid">
        <aside className="sidebar">
          <div className="panel summaryPanel">
            <h2>Recent Training</h2>
            <dl className="summaryGrid">
              <Metric label="7 days" value={`${state.summary.mileageLast7Days} mi`} />
              <Metric label="14 days" value={`${state.summary.mileageLast14Days} mi`} />
              <Metric label="28 days" value={`${state.summary.mileageLast28Days} mi`} />
              <Metric label="Days since run" value={state.summary.daysSinceLastRun ?? "n/a"} />
              <Metric label="Long run 14d" value={`${state.summary.longestRunLast14DaysMiles} mi`} />
              <Metric label="Run count 14d" value={state.summary.runCountLast14Days} />
            </dl>
            {state.lastRefreshAt ? (
              <p className="muted">Last refresh {new Date(state.lastRefreshAt).toLocaleString()}</p>
            ) : (
              <p className="muted">No Strava refresh yet.</p>
            )}
          </div>

          <div className="panel">
            <h2>Latest Runs</h2>
            <div className="activityList">
              {runs.length === 0 ? (
                <p className="muted">Runs will appear here after a Strava refresh.</p>
              ) : (
                runs.slice(0, 8).map((activity) => (
                  <div className="activity" key={activity.providerActivityId}>
                    <div>
                      <strong>{activity.name ?? activity.sportType}</strong>
                      <span>{activity.startDate.slice(0, 10)}</span>
                    </div>
                    <b>{formatMiles(activity.distanceMeters)}</b>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="workspace">
          <div className="contextRow">
            <label className={isEditingPlan ? "" : "locked"}>
              <span className="fieldHeader">
                Plan context
                {isEditingPlan ? (
                  <span className="fieldActions">
                    <button
                      className="miniButton"
                      type="button"
                      onClick={() => saveDurableContext("plan")}
                      disabled={isSavingContext}
                    >
                      Save
                    </button>
                    <button
                      className="miniButton secondaryMini"
                      type="button"
                      onClick={() => {
                        setPlanSource(savedPlanSource);
                        setPlanVariant(savedPlanVariant);
                        setPlanContext(savedPlanContext);
                        setIsEditingPlan(false);
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="miniButton" type="button" onClick={() => setIsEditingPlan(true)}>
                    Edit
                  </button>
                )}
              </span>
              <select
                value={planSource}
                disabled={!isEditingPlan}
                onChange={(event) => setPlanSource(event.target.value as TrainingPlanSource)}
              >
                {trainingPlanProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                    {profile.examples ? ` - ${profile.examples}` : ""}
                  </option>
                ))}
              </select>
              <input
                value={planVariant}
                disabled={!isEditingPlan}
                onChange={(event) => setPlanVariant(event.target.value)}
                placeholder="Variant / level, e.g. 18/55, 2Q, NRC Marathon, Novice 2"
              />
              <textarea
                value={planContext}
                disabled={!isEditingPlan}
                onChange={(event) => setPlanContext(event.target.value)}
                placeholder="This week calls for threshold Tuesday, easy Thursday, long run Sunday..."
              />
            </label>
            <label className={isEditingGoals ? "" : "locked"}>
              <span className="fieldHeader">
                Goals context
                {isEditingGoals ? (
                  <span className="fieldActions">
                    <button
                      className="miniButton"
                      type="button"
                      onClick={() => saveDurableContext("goals")}
                      disabled={isSavingContext}
                    >
                      Save
                    </button>
                    <button
                      className="miniButton secondaryMini"
                      type="button"
                      onClick={() => {
                        setGoalsContext(savedGoalsContext);
                        setIsEditingGoals(false);
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button className="miniButton" type="button" onClick={() => setIsEditingGoals(true)}>
                    Edit
                  </button>
                )}
              </span>
              <textarea
                value={goalsContext}
                disabled={!isEditingGoals}
                onChange={(event) => setGoalsContext(event.target.value)}
                placeholder="Half marathon on Oct 12, goal is steady aerobic build..."
              />
            </label>
            <label>
              <span>Current subjective context</span>
              <textarea
                value={subjectiveContext}
                onChange={(event) => setSubjectiveContext(event.target.value)}
                placeholder="Slept badly, calf 3/10 sore, 45 minutes available, hot outside..."
              />
            </label>
          </div>

          <form className="chat" onSubmit={askQuestion}>
            <label>
              <span>Question</span>
              <textarea
                className="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="I missed three days. What should I run today?"
              />
            </label>
            <button className="button askButton" disabled={isAsking || !question.trim()}>
              {isAsking ? "Thinking..." : "Ask TrainingTweaks"}
            </button>
          </form>

          <article className="answer">
            {answer ? (
              <Markdownish text={answer} />
            ) : (
              <p className="muted">
                Answers will use recommendation, why, alternatives, risk flags, confidence, and
                what to watch.
              </p>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, index) => {
        if (block.startsWith("## ")) {
          const [heading, ...rest] = block.split("\n");
          return (
            <section key={index}>
              <h2>{heading.replace(/^##\s+/, "")}</h2>
              {rest.length ? <p>{rest.join("\n")}</p> : null}
            </section>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </>
  );
}

function formatMiles(meters?: number) {
  if (!meters) return "n/a";
  return `${Math.round((meters / 1609.344) * 10) / 10} mi`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
