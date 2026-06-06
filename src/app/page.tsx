"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { buildStarterMarathonPlan, type MarathonPlanRiskTolerance } from "@/lib/marathon-plan";
import { structuredPlanSummary } from "@/lib/structured-plans";
import { trainingPlanProfiles } from "@/lib/training-plans";
import type {
  Activity,
  ActivitySummary,
  RiskFinding,
  RiskSeverity,
  StructuredTrainingPlan,
  TrainingContext,
  TrainingPlanDayOfWeek,
  TrainingPlanWeek,
  TrainingPlanSource
} from "@/lib/types";

type AppState = {
  connected: boolean;
  lastRefreshAt?: string;
  activities: Activity[];
  context?: TrainingContext;
  summary: ActivitySummary;
  riskFindings?: RiskFinding[];
};

type TrainingStatus = "de-training" | "productive" | "risky" | "high-risk";
type AppTab = "today" | "plan";

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

const statusScale: TrainingStatus[] = ["de-training", "productive", "risky", "high-risk"];
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const dayOrder: TrainingPlanDayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dashboardGroups = [
  {
    id: "load",
    label: "Load",
    rules: [
      { ruleId: "weekly_volume_growth", label: "Weekly volume" },
      { ruleId: "acwr_mileage", label: "7d/28d load" },
      { ruleId: "consecutive_build_weeks", label: "Build weeks" }
    ]
  },
  {
    id: "intensity",
    label: "Intensity",
    rules: [
      { ruleId: "hard_session_count", label: "Hard sessions" },
      { ruleId: "intensity_spike", label: "Intensity load" },
      { ruleId: "hard_day_clustering", label: "Hard-day spacing" }
    ]
  },
  {
    id: "durability",
    label: "Durability",
    rules: [
      { ruleId: "long_run_percentage", label: "Long-run share" },
      { ruleId: "long_run_jump", label: "Long-run jump" },
      { ruleId: "consecutive_running_days", label: "Run streak" }
    ]
  }
];

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
  const [savedStructuredPlan, setSavedStructuredPlan] = useState<StructuredTrainingPlan | undefined>();
  const [starterCurrentMileage, setStarterCurrentMileage] = useState(0);
  const [starterTargetMileage, setStarterTargetMileage] = useState(40);
  const [starterPlanWeeks, setStarterPlanWeeks] = useState(16);
  const [starterRiskTolerance, setStarterRiskTolerance] = useState<MarathonPlanRiskTolerance>("regular");
  const [starterStartDate, setStarterStartDate] = useState(nextMondayIsoDate());
  const [selectedPlanWeek, setSelectedPlanWeek] = useState(1);
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [savedGoalsContext, setSavedGoalsContext] = useState("");
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerModelRunId, setAnswerModelRunId] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<"positive" | "negative" | "">("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [savedFeedbackRating, setSavedFeedbackRating] = useState<"positive" | "negative" | "">("");
  const [savedFeedbackNote, setSavedFeedbackNote] = useState("");
  const [feedbackSavedAt, setFeedbackSavedAt] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [status, setStatus] = useState("Loading local training context...");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

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
    const currentMileageEstimate = estimateCurrentMilesPerWeek(nextState.summary);
    setPlanSource(nextPlanSource);
    setPlanVariant(nextPlanVariant);
    setPlanContext(nextPlanContext);
    setStarterCurrentMileage(currentMileageEstimate);
    setStarterTargetMileage(Math.max(currentMileageEstimate, peakPlanMileage(nextState.context?.structuredPlan) ?? 40));
    setStarterStartDate(nextState.context?.structuredPlan?.startDate ?? nextMondayIsoDate());
    setSelectedPlanWeek(currentCalendarWeek(nextState.context?.structuredPlan));
    setGoalsContext(nextGoalsContext);
    setSavedPlanSource(nextPlanSource);
    setSavedPlanVariant(nextPlanVariant);
    setSavedPlanContext(nextPlanContext);
    setSavedStructuredPlan(nextState.context?.structuredPlan);
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
        summary: payload.summary,
        riskFindings: payload.riskFindings
      }));
      const currentMileageEstimate = estimateCurrentMilesPerWeek(payload.summary);
      setStarterCurrentMileage(currentMileageEstimate);
      setStarterTargetMileage((current) => Math.max(current, currentMileageEstimate));
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
          structuredPlan: state.context?.structuredPlan,
          goalsContext,
          subjectiveContext
        })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Context save failed.");

      setSavedPlanSource(planSource);
      setSavedPlanVariant(planVariant);
      setSavedPlanContext(planContext);
      setSavedStructuredPlan(state.context?.structuredPlan);
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
    setStatus("Reasoning through the training decision...");
    setError("");
    setAnswer("");
    setAnswerModelRunId("");
    setFeedbackRating("");
    setFeedbackNote("");
    setSavedFeedbackRating("");
    setSavedFeedbackNote("");
    setFeedbackSavedAt("");
    setFeedbackMessage("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planContext,
          planSource,
          planVariant,
          structuredPlan: state.context?.structuredPlan,
          goalsContext,
          subjectiveContext,
          question
        })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Chat request failed.");

      setAnswer(payload.answer);
      setAnswerModelRunId(payload.modelRunId ?? "");
      setStatus("Answer ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed.";
      setError(message);
      setStatus("Chat request failed.");
    } finally {
      setIsAsking(false);
    }
  }

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function generateStarterMarathonPlan() {
    const structuredPlan = buildStarterMarathonPlan({
      currentMilesPerWeek: starterCurrentMileage,
      targetMilesPerWeek: starterTargetMileage,
      durationWeeks: starterPlanWeeks,
      riskTolerance: starterRiskTolerance,
      startDate: starterStartDate
    });
    setState((current) => ({
      ...current,
      context: {
        ...current.context,
        structuredPlan
      }
    }));
    setPlanSource("custom");
    setPlanVariant("TrainingTweaks generic marathon");
    setSelectedPlanWeek(currentCalendarWeek(structuredPlan));
    setStatus("Starter marathon plan generated. Save plan context to persist it.");
  }

  async function saveFeedback() {
    if (!answerModelRunId) return;
    if (!feedbackRating) {
      setFeedbackMessage("Choose Helpful or Not helpful before saving.");
      return;
    }

    setIsSavingFeedback(true);
    setError("");
    try {
      const response = await fetch("/api/model-runs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: answerModelRunId,
          note: feedbackNote,
          rating: feedbackRating
        })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Feedback save failed.");

      setFeedbackRating(payload.feedback?.rating ?? feedbackRating);
      setSavedFeedbackRating(payload.feedback?.rating ?? feedbackRating);
      setSavedFeedbackNote(payload.feedback?.note ?? "");
      setFeedbackSavedAt(payload.feedback?.updatedAt ?? new Date().toISOString());
      setFeedbackMessage(payload.verified ? "Feedback captured and verified." : "Feedback saved.");
      setStatus("Feedback captured.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Feedback save failed.";
      setError(message);
      setStatus("Feedback save failed.");
    } finally {
      setIsSavingFeedback(false);
    }
  }

  const runs = useMemo(
    () => state.activities.filter((activity) => activity.sportType.toLowerCase().includes("run")),
    [state.activities]
  );
  const hasUnsavedFeedback =
    Boolean(feedbackSavedAt) &&
    (feedbackNote.trim() !== savedFeedbackNote || feedbackRating !== savedFeedbackRating);
  const dashboard = buildDashboardGroups(state.riskFindings ?? [], state.summary);
  const visibleStructuredPlan = state.context?.structuredPlan;

  return (
    <main className="appShell">
      <aside className="navRail">
        <div>
          <p className="eyebrow">TrainingTweaks</p>
          <h1>Decision cockpit</h1>
        </div>
        <nav>
          <button className={activeTab === "today" ? "active" : ""} onClick={() => setActiveTab("today")} type="button">
            Today
          </button>
          <button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")} type="button">
            Plan
          </button>
          <a href="/model-runs">Model review</a>
        </nav>
        <div className="navActions">
          <a className="button secondary" href="/model-runs">
            Review Runs
          </a>
          <a className="button secondary" href="/api/strava/auth">
            Connect Strava
          </a>
          <button className="button" onClick={refreshStrava} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh Strava Data"}
          </button>
          <button className="button secondary" onClick={logOut}>
            Log out
          </button>
        </div>
      </aside>

      <section className="appMain">
        <header className="appHeader">
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h2>Training status</h2>
        </header>

        <section className="statusDashboard">
          {dashboard.map((group) => (
            <section className={`statusCard ${group.status}`} key={group.id}>
              <header>
                <div>
                  <h3>{group.label}</h3>
                  <strong>{statusLabel(group.status)}</strong>
                </div>
                <p>{group.summary}</p>
              </header>
              <div className="statusBars" aria-label={`${group.label} status scale`}>
                {statusScale.map((status) => (
                  <span
                    className={`statusBar ${status} ${status === group.status ? "active" : ""}`}
                    key={status}
                    title={statusLabel(status)}
                  />
                ))}
              </div>
              <div className="metricList">
                {group.metrics.map((metric) => (
                  <div className="metricLine" key={metric.ruleId}>
                    <span className={`metricDot ${metric.severity}`} />
                    <strong>{metric.label}</strong>
                    <b>{metric.value}</b>
                    <small>{metric.detail}</small>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </section>

        <section className="statusLine" aria-live="polite">
          <span className={state.connected ? "dot connected" : "dot"} />
          {status}
        </section>
        {error ? <section className="errorLine">{error}</section> : null}

        {activeTab === "today" ? (
        <section className="coreGrid">
          <section className="workspace">
          <div className="contextRow">
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
              <>
                <Markdownish text={answer} />
                {answerModelRunId ? (
                  <section className="feedback">
                    <div className="feedbackActions">
                      <button
                        className={feedbackRating === "positive" ? "miniButton" : "miniButton secondaryMini"}
                        disabled={isSavingFeedback}
                        onClick={() => {
                          setFeedbackRating("positive");
                          setFeedbackMessage("");
                        }}
                        type="button"
                      >
                        Helpful
                      </button>
                      <button
                        className={feedbackRating === "negative" ? "miniButton" : "miniButton secondaryMini"}
                        disabled={isSavingFeedback}
                        onClick={() => {
                          setFeedbackRating("negative");
                          setFeedbackMessage("");
                        }}
                        type="button"
                      >
                        Not helpful
                      </button>
                      <button
                        className="miniButton"
                        disabled={isSavingFeedback || !feedbackRating}
                        onClick={saveFeedback}
                        type="button"
                      >
                        {isSavingFeedback ? "Saving..." : "Save feedback"}
                      </button>
                    </div>
                    <textarea
                      className="feedbackNote"
                      onChange={(event) => {
                        setFeedbackNote(event.target.value);
                        if (feedbackSavedAt) setFeedbackMessage("");
                      }}
                      placeholder="Optional commentary for later review..."
                      value={feedbackNote}
                    />
                    {feedbackMessage || feedbackSavedAt ? (
                      <p className="feedbackStatus">
                        {feedbackMessage || "Feedback captured."}
                        {feedbackSavedAt ? ` Last saved ${new Date(feedbackSavedAt).toLocaleString()}.` : ""}
                        {savedFeedbackNote ? ` Commentary: "${savedFeedbackNote}"` : ""}
                        {hasUnsavedFeedback ? " You have unsaved feedback changes." : ""}
                      </p>
                    ) : (
                      <p className="feedbackStatus muted">Choose a rating, add optional commentary, then save feedback.</p>
                    )}
                  </section>
                ) : null}
              </>
            ) : (
              <p className="muted">
                Answers will prioritize the timing, the practical recommendation, and the key tradeoff.
              </p>
            )}
          </article>
          </section>

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
        </section>
        ) : (
          <PlanWorkspace
            isEditingPlan={isEditingPlan}
            isSavingContext={isSavingContext}
            onCancel={() => {
              setPlanSource(savedPlanSource);
              setPlanVariant(savedPlanVariant);
              setPlanContext(savedPlanContext);
              setState((current) => ({
                ...current,
                context: {
                  ...current.context,
                  structuredPlan: savedStructuredPlan
                }
              }));
              setSelectedPlanWeek(currentCalendarWeek(savedStructuredPlan));
              setIsEditingPlan(false);
            }}
            onEdit={() => setIsEditingPlan(true)}
            onGenerate={generateStarterMarathonPlan}
            onSave={() => saveDurableContext("plan")}
            plan={visibleStructuredPlan}
            planContext={planContext}
            planSource={planSource}
            planVariant={planVariant}
            selectedPlanWeek={selectedPlanWeek}
            setPlanContext={setPlanContext}
            setPlanSource={setPlanSource}
            setPlanVariant={setPlanVariant}
            setSelectedPlanWeek={setSelectedPlanWeek}
            setStarterCurrentMileage={setStarterCurrentMileage}
            setStarterPlanWeeks={setStarterPlanWeeks}
            setStarterRiskTolerance={setStarterRiskTolerance}
            setStarterStartDate={setStarterStartDate}
            setStarterTargetMileage={setStarterTargetMileage}
            starterCurrentMileage={starterCurrentMileage}
            starterPlanWeeks={starterPlanWeeks}
            starterRiskTolerance={starterRiskTolerance}
            starterStartDate={starterStartDate}
            starterTargetMileage={starterTargetMileage}
          />
        )}
      </section>
    </main>
  );
}

function PlanWorkspace({
  isEditingPlan,
  isSavingContext,
  onCancel,
  onEdit,
  onGenerate,
  onSave,
  plan,
  planContext,
  planSource,
  planVariant,
  selectedPlanWeek,
  setPlanContext,
  setPlanSource,
  setPlanVariant,
  setSelectedPlanWeek,
  setStarterCurrentMileage,
  setStarterPlanWeeks,
  setStarterRiskTolerance,
  setStarterStartDate,
  setStarterTargetMileage,
  starterCurrentMileage,
  starterPlanWeeks,
  starterRiskTolerance,
  starterStartDate,
  starterTargetMileage
}: {
  isEditingPlan: boolean;
  isSavingContext: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onGenerate: () => void;
  onSave: () => void;
  plan?: StructuredTrainingPlan;
  planContext: string;
  planSource: TrainingPlanSource;
  planVariant: string;
  selectedPlanWeek: number;
  setPlanContext: (value: string) => void;
  setPlanSource: (value: TrainingPlanSource) => void;
  setPlanVariant: (value: string) => void;
  setSelectedPlanWeek: (value: number) => void;
  setStarterCurrentMileage: (value: number) => void;
  setStarterPlanWeeks: (value: number) => void;
  setStarterRiskTolerance: (value: MarathonPlanRiskTolerance) => void;
  setStarterStartDate: (value: string) => void;
  setStarterTargetMileage: (value: number) => void;
  starterCurrentMileage: number;
  starterPlanWeeks: number;
  starterRiskTolerance: MarathonPlanRiskTolerance;
  starterStartDate: string;
  starterTargetMileage: number;
}) {
  const selectedWeek = plan?.weeks.find((week) => week.weekNumber === selectedPlanWeek) ?? plan?.weeks[0];
  const selectedMetrics = plan && selectedWeek ? plannedWeekMetrics(plan, selectedWeek) : [];
  const selectedDays = plan && selectedWeek ? calendarWorkoutDays(plan, selectedWeek) : [];

  return (
    <section className="planWorkspace">
      <section className="planHero">
        <div>
          <p className="eyebrow">Plan</p>
          <h2>{plan?.name ?? "Build a deterministic marathon plan"}</h2>
          <p>{structuredPlanSummary(plan)}</p>
        </div>
        <div className="fieldActions">
          {isEditingPlan ? (
            <>
              <button className="miniButton" onClick={onSave} disabled={isSavingContext} type="button">
                Save plan
              </button>
              <button className="miniButton secondaryMini" onClick={onCancel} type="button">
                Cancel
              </button>
            </>
          ) : (
            <button className="miniButton" onClick={onEdit} type="button">
              Edit plan
            </button>
          )}
        </div>
      </section>

      <section className="planLayout">
        <aside className="planBuilderPanel">
          <div className="planBuilderHeader">
            <h3>Plan builder</h3>
            <span>{isEditingPlan ? "Editable" : "Locked"}</span>
          </div>
          <label>
            <span>Plan source</span>
            <select
              value={planSource}
              disabled={!isEditingPlan}
              onChange={(event) => setPlanSource(event.target.value as TrainingPlanSource)}
            >
              {trainingPlanProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                  {profile.variants?.length ? ` - ${profile.variants.slice(0, 3).join(", ")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Variant</span>
            <input
              value={planVariant}
              disabled={!isEditingPlan}
              onChange={(event) => setPlanVariant(event.target.value)}
              placeholder="TrainingTweaks generic marathon"
            />
          </label>
          <div className="planBuilder">
            <span>Starter marathon</span>
            <label>
              <span>Start date</span>
              <input
                aria-label="Plan start date"
                disabled={!isEditingPlan}
                onChange={(event) => setStarterStartDate(event.target.value)}
                type="date"
                value={starterStartDate}
              />
            </label>
            <div className="planControlGrid">
              <label>
                <span>Current mi/wk</span>
                <input
                  aria-label="Current miles per week"
                  disabled={!isEditingPlan}
                  min={0}
                  onChange={(event) => setStarterCurrentMileage(Number(event.target.value))}
                  step={0.1}
                  type="number"
                  value={starterCurrentMileage}
                />
              </label>
              <label>
                <span>Target mi/wk</span>
                <input
                  aria-label="Target miles per week"
                  disabled={!isEditingPlan}
                  min={0}
                  onChange={(event) => setStarterTargetMileage(Number(event.target.value))}
                  step={0.1}
                  type="number"
                  value={starterTargetMileage}
                />
              </label>
            </div>
            <div className="planControlGrid">
              <label>
                <span>Weeks</span>
                <input
                  aria-label="Plan length weeks"
                  disabled={!isEditingPlan}
                  max={24}
                  min={8}
                  onChange={(event) => setStarterPlanWeeks(Number(event.target.value))}
                  type="number"
                  value={starterPlanWeeks}
                />
              </label>
              <label>
                <span>Risk tolerance</span>
                <select
                  aria-label="Risk tolerance"
                  disabled={!isEditingPlan}
                  onChange={(event) => setStarterRiskTolerance(event.target.value as MarathonPlanRiskTolerance)}
                  value={starterRiskTolerance}
                >
                  <option value="low">low</option>
                  <option value="regular">regular</option>
                  <option value="high">high</option>
                </select>
              </label>
            </div>
            <button className="miniButton" disabled={!isEditingPlan} onClick={onGenerate} type="button">
              Generate plan
            </button>
          </div>
          <label>
            <span>Plan notes</span>
            <textarea
              value={planContext}
              disabled={!isEditingPlan}
              onChange={(event) => setPlanContext(event.target.value)}
              placeholder="Anything the plan builder should remember..."
            />
          </label>
        </aside>

        <section className="planViewer">
          {plan ? (
            <>
              <div className="weekStrip" aria-label="Plan weeks">
                {plan.weeks.map((week) => (
                  <button
                    className={week.weekNumber === selectedPlanWeek ? "active" : ""}
                    key={week.weekNumber}
                    onClick={() => setSelectedPlanWeek(week.weekNumber)}
                    type="button"
                  >
                    <strong>Week {week.weekNumber}</strong>
                    <span>{weekDateRange(plan, week.weekNumber)}</span>
                  </button>
                ))}
              </div>
              {selectedWeek ? (
                <section className="weekPanel">
                  <header className="weekHeader">
                    <div>
                      <p className="eyebrow">{weekDateRange(plan, selectedWeek.weekNumber)}</p>
                      <h3>
                        Week {selectedWeek.weekNumber}: {selectedWeek.focus}
                      </h3>
                    </div>
                    <strong>{selectedWeek.targetMiles ?? 0} mi</strong>
                  </header>
                  <div className="planMetricGrid">
                    {selectedMetrics.map((metric) => (
                      <div className="planMetric" key={metric.label}>
                        <span className={`metricDot ${metric.severity}`} />
                        <small>{metric.label}</small>
                        <strong>{metric.value}</strong>
                        <p>{metric.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="workoutCalendar">
                    {selectedDays.map((day) => (
                      <article className={day.workout.type === "rest" ? "workoutDay restDay" : "workoutDay"} key={day.dayOfWeek}>
                        <header>
                          <span>{day.label}</span>
                          <strong>{day.dateLabel}</strong>
                        </header>
                        <h4>{day.workout.label}</h4>
                        <p>
                          {day.workout.targetMiles ? `${day.workout.targetMiles} mi` : day.workout.durationMinutes ? `${day.workout.durationMinutes} min` : "No run"}
                        </p>
                        <small>{day.workout.purpose}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <section className="emptyPlan">
              <h3>No plan yet</h3>
              <p>Open Edit plan, choose the builder inputs, generate a plan, then save it.</p>
            </section>
          )}
        </section>
      </section>
    </section>
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

function estimateCurrentMilesPerWeek(summary: ActivitySummary) {
  if (summary.mileageLast28Days > 0) return round1(summary.mileageLast28Days / 4);
  if (summary.mileageLast14Days > 0) return round1(summary.mileageLast14Days / 2);
  return summary.mileageLast7Days;
}

function peakPlanMileage(plan?: StructuredTrainingPlan) {
  if (!plan?.weeks.length) return undefined;
  return Math.max(...plan.weeks.map((week) => week.targetMiles ?? 0));
}

function plannedWeekMetrics(plan: StructuredTrainingPlan, week: TrainingPlanWeek) {
  const assessment = (ruleId: string) =>
    plan.generator?.riskAssessments.find((candidate) => candidate.weekNumber === week.weekNumber && candidate.ruleId === ruleId);
  const targetMiles = week.targetMiles ?? 0;
  const workouts = week.days.filter((day) => day.workout.type === "workout");
  const workoutMiles = round1(workouts.reduce((total, day) => total + (day.workout.targetMiles ?? 0), 0));
  const longRunMiles = week.days.find((day) => day.workout.type === "long_run")?.workout.targetMiles ?? 0;
  const longRunShare = targetMiles ? round1((longRunMiles / targetMiles) * 100) : 0;
  const load = assessment("weekly_volume_growth");
  const intensity = assessment("hard_session_count");
  const durability = assessment("long_run_percentage");

  return [
    {
      label: "Expected load",
      value: `${targetMiles} mi`,
      detail: load?.message ?? "Week target mileage",
      severity: load?.severity ?? "green"
    },
    {
      label: "Expected intensity",
      value: `${workouts.length} workout${workouts.length === 1 ? "" : "s"}`,
      detail: workoutMiles ? `${workoutMiles} mi quality placeholder` : "No quality workout scheduled",
      severity: intensity?.severity ?? "green"
    },
    {
      label: "Expected durability",
      value: `${longRunMiles} mi long`,
      detail: durability?.message ?? `${longRunShare}% of week in long run`,
      severity: durability?.severity ?? "green"
    }
  ];
}

function calendarWorkoutDays(plan: StructuredTrainingPlan, week: TrainingPlanWeek) {
  return dayOrder.map((dayOfWeek, index) => {
    const scheduled = week.days.find((day) => day.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      label: dayLabel(dayOfWeek),
      dateLabel: formatDate(addDays(planStartDate(plan), (week.weekNumber - 1) * 7 + index), {
        month: "short",
        day: "numeric"
      }),
      workout: scheduled?.workout ?? {
        type: "rest" as const,
        label: "Rest",
        intensity: "off" as const,
        purpose: "No run scheduled"
      }
    };
  });
}

function weekDateRange(plan: StructuredTrainingPlan, weekNumber: number) {
  const start = addDays(planStartDate(plan), (weekNumber - 1) * 7);
  const end = addDays(start, 6);
  return `${formatDate(start, { month: "short", day: "numeric" })} - ${formatDate(end, {
    month: "short",
    day: "numeric"
  })}`;
}

function currentCalendarWeek(plan?: StructuredTrainingPlan) {
  if (!plan) return 1;
  const start = planStartDate(plan);
  const today = stripTime(new Date());
  const deltaDays = Math.floor((today.getTime() - start.getTime()) / millisecondsPerDay);
  return Math.min(plan.durationWeeks, Math.max(1, Math.floor(deltaDays / 7) + 1));
}

function planStartDate(plan: StructuredTrainingPlan) {
  return parseIsoDate(plan.startDate) ?? parseIsoDate(nextMondayIsoDate()) ?? stripTime(new Date());
}

function parseIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return stripTime(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function nextMondayIsoDate() {
  const date = stripTime(new Date());
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  return isoDate(addDays(date, daysUntilMonday));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function stripTime(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleDateString(undefined, options);
}

function dayLabel(dayOfWeek: TrainingPlanDayOfWeek) {
  return dayOfWeek.slice(0, 3).toUpperCase();
}

function buildDashboardGroups(findings: RiskFinding[], summary: ActivitySummary) {
  const signalFindings = findings.filter((finding) => finding.category !== "data_quality");
  return dashboardGroups.map((group) => {
    const metrics = group.rules.map((rule) => {
      const finding = strongestFinding(signalFindings.filter((candidate) => candidate.ruleId === rule.ruleId));
      return {
        ...rule,
        severity: metricSeverity(finding),
        value: metricValue(rule.ruleId, finding, summary),
        detail: metricDetail(rule.ruleId, finding, summary),
        finding
      };
    });
    const status = groupStatus(group.id, metrics);
    return {
      ...group,
      metrics,
      status,
      summary: groupSummary(group.id, status)
    };
  });
}

function strongestFinding(findings: RiskFinding[]) {
  const severityOrder: Record<RiskSeverity, number> = {
    info: 0,
    green: 1,
    yellow: 2,
    red: 3
  };
  return findings.sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity])[0];
}

function groupStatus(
  groupId: string,
  metrics: Array<{ ruleId: string; finding?: RiskFinding; severity: "green" | "yellow" | "red" }>
): TrainingStatus {
  if (metrics.some((metric) => metric.severity === "red")) return "high-risk";
  if (metrics.some((metric) => metric.severity === "yellow")) return "risky";
  if (groupId === "load" && isLoadDetraining(metrics)) return "de-training";
  if (groupId === "intensity" && (metrics[0]?.finding?.observedValue ?? 1) === 0) return "de-training";
  if (groupId === "durability" && (metrics[0]?.finding?.observedValue ?? 1) === 0) return "de-training";
  return "productive";
}

function isLoadDetraining(metrics: Array<{ ruleId: string; finding?: RiskFinding }>) {
  const weeklyGrowth = metrics.find((metric) => metric.ruleId === "weekly_volume_growth")?.finding?.observedValue;
  const acwr = metrics.find((metric) => metric.ruleId === "acwr_mileage")?.finding?.observedValue;
  return (weeklyGrowth !== undefined && weeklyGrowth <= -0.2) || (acwr !== undefined && acwr < 0.75);
}

function groupSummary(groupId: string, status: TrainingStatus) {
  if (status === "high-risk") {
    if (groupId === "load") return "Load is outside current guardrails.";
    if (groupId === "intensity") return "Quality work is clustered too tightly.";
    return "Durability guardrails are under pressure.";
  }
  if (status === "risky") {
    if (groupId === "load") return "Load is productive but needs attention.";
    if (groupId === "intensity") return "Quality is useful, but spacing is tight.";
    return "Durability is usable with one watch item.";
  }
  if (status === "de-training") {
    if (groupId === "load") return "Recent load is below the training baseline.";
    if (groupId === "intensity") return "Quality stimulus is currently low.";
    return "Durability stimulus is currently light.";
  }
  if (groupId === "load") return "Volume is building without a spike.";
  if (groupId === "intensity") return "Quality work is within current guardrails.";
  return "Long run and streak support the build.";
}

function statusLabel(status: TrainingStatus) {
  if (status === "de-training") return "De-training";
  if (status === "high-risk") return "High risk";
  return status[0].toUpperCase() + status.slice(1);
}

function metricSeverity(finding: RiskFinding | undefined): "green" | "yellow" | "red" {
  if (finding?.severity === "red") return "red";
  if (finding?.severity === "yellow") return "yellow";
  return "green";
}

function metricValue(ruleId: string, finding: RiskFinding | undefined, summary: ActivitySummary) {
  if (finding) {
    const observed = finding.observedValue;
    if (ruleId === "weekly_volume_growth") return observed === undefined ? "n/a" : signedPercent(observed);
    if (ruleId === "acwr_mileage") return observed === undefined ? "n/a" : `${round2(observed)}x`;
    if (ruleId === "consecutive_build_weeks") return `${observed ?? "n/a"}`;
    if (ruleId === "long_run_percentage") return observed === undefined ? "n/a" : `${Math.round(observed * 100)}%`;
    if (ruleId === "long_run_jump") return observed === undefined ? "n/a" : signedPercent(observed);
    if (ruleId === "hard_session_count") return `${observed ?? "n/a"} / 7d`;
    if (ruleId === "intensity_spike") return observed === undefined ? "n/a" : signedPercent(observed);
    if (ruleId === "hard_day_clustering") return observed === undefined ? "checked" : `${observed} hard`;
    if (ruleId === "consecutive_running_days") return `${observed ?? "n/a"} days`;
  }

  if (ruleId === "weekly_volume_growth") return `${summary.mileageLast7Days} mi / 7d`;
  if (ruleId === "acwr_mileage") return `${summary.mileageLast28Days} mi / 28d`;
  if (ruleId === "long_run_percentage") return `${summary.longestRunLast14DaysMiles} mi`;
  if (ruleId === "hard_session_count" || ruleId === "intensity_spike") {
    return `${summary.recentIntensityIndicators.length}`;
  }

  return "n/a";
}

function metricDetail(ruleId: string, finding: RiskFinding | undefined, summary: ActivitySummary) {
  if (finding) {
    if (ruleId === "weekly_volume_growth") return "vs prior week";
    if (ruleId === "acwr_mileage") return "7d vs 28d baseline";
    if (ruleId === "consecutive_build_weeks") return "consecutive increases";
    if (ruleId === "long_run_percentage") return `${summary.longestRunLast14DaysMiles} mi of ${summary.mileageLast7Days} mi`;
    if (ruleId === "long_run_jump") return "vs prior 4-week avg";
    if (ruleId === "hard_session_count") return "inferred hard runs";
    if (ruleId === "intensity_spike") return `${finding.evidence.proxy ?? "load"} proxy`;
    if (ruleId === "hard_day_clustering") return finding.severity === "green" ? "no cluster detected" : "cluster pattern";
    if (ruleId === "consecutive_running_days") return "current streak";
  }

  if (ruleId === "weekly_volume_growth") return "waiting on prior week";
  if (ruleId === "acwr_mileage") return "waiting on baseline";
  if (ruleId === "consecutive_build_weeks") return "waiting on week history";
  if (ruleId === "long_run_percentage") return "waiting on weekly mileage";
  if (ruleId === "long_run_jump") return "waiting on long-run baseline";
  if (ruleId === "hard_session_count") return "waiting on classification";
  if (ruleId === "intensity_spike") return "waiting on effort baseline";
  if (ruleId === "hard_day_clustering") return "waiting on hard sessions";
  return "waiting on run streak";
}

function signedPercent(value: number) {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
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
