"use client";

import { type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import { generateTrainingPlan } from "@/lib/plan-generator";
import {
  acceptPreviewPlan,
  discardPreviewPlan,
  peakLongRunMiles,
  previewGeneratedPlan,
  weeklyPreviewRows,
  type PlanPreviewState
} from "@/lib/plan-preview";
import { buildActivePlanSnapshot, type ActivePlanSnapshot } from "@/lib/active-plan-snapshot";
import { buildTodayDecisionViewModel, type TodayDecisionViewModel } from "@/lib/today-decision-view-model";
import { structuredPlanSummary } from "@/lib/structured-plans";
import type {
  Activity,
  ActivitySummary,
  RiskFinding,
  RiskSeverity,
  StructuredTrainingPlan,
  TrainingContext,
  TrainingPlanGeneratorAggression,
  TrainingPlanGeneratorGoal,
  TrainingPlanDayOfWeek,
  TrainingPlanWorkoutType,
  TrainingPlanWeek,
  TrainingPlanSource
} from "@/lib/types";

type AppState = {
  connected: boolean;
  lastRefreshAt?: string;
  activities: Activity[];
  context?: TrainingContext;
  summary: ActivitySummary;
  activePlanSnapshot?: ActivePlanSnapshot;
  riskFindings?: RiskFinding[];
};

type TrainingStatus = "de-training" | "productive" | "risky" | "high-risk";
type AppTab = "today" | "plan";
type PlanSetupMode = "choose" | "build";
type PlanCalendarView = "month" | "week" | "window";
type CalendarWorkoutKind = "actual" | "longRun" | "recovery" | "rest" | "workout";

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
const calendarLegendItems: { kind: CalendarWorkoutKind; label: string }[] = [
  { kind: "workout", label: "Workout" },
  { kind: "recovery", label: "Recovery" },
  { kind: "longRun", label: "Long run" },
  { kind: "rest", label: "Rest" },
  { kind: "actual", label: "Actual" }
];

const dashboardGroups = [
  {
    id: "context",
    label: "Context",
    rules: [
      { ruleId: "capacity_context", label: "Capacity" },
      { ruleId: "adaptation_context", label: "Adaptation" },
      { ruleId: "decision_risk_observed", label: "Decision risk" }
    ]
  },
  {
    id: "exposure",
    label: "Exposure",
    rules: [
      { ruleId: "cardio_load_7d", label: "Cardio load" },
      { ruleId: "mechanical_exposure_7d", label: "Mechanical" },
      { ruleId: "fast_running_novelty", label: "Fast running" }
    ]
  },
  {
    id: "novelty",
    label: "Novelty",
    rules: [
      { ruleId: "mileage_novelty", label: "Mileage" },
      { ruleId: "long_run_novelty", label: "Long run" },
      { ruleId: "cardio_load_novelty", label: "Cardio" },
      { ruleId: "elevation_novelty", label: "Elevation" }
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
  const [previewStructuredPlan, setPreviewStructuredPlan] = useState<StructuredTrainingPlan | undefined>();
  const [starterGoalType, setStarterGoalType] = useState<TrainingPlanGeneratorGoal>("half_marathon");
  const [starterDaysPerWeek, setStarterDaysPerWeek] = useState(4);
  const [starterTargetMileage, setStarterTargetMileage] = useState(40);
  const [starterPlanWeeks, setStarterPlanWeeks] = useState(16);
  const [starterAggression, setStarterAggression] = useState<TrainingPlanGeneratorAggression>("balanced");
  const [starterStartDate, setStarterStartDate] = useState(nextMondayIsoDate());
  const [selectedPlanWeek, setSelectedPlanWeek] = useState(1);
  const [selectedPlanDate, setSelectedPlanDate] = useState(todayIsoDate());
  const [planCalendarView, setPlanCalendarView] = useState<PlanCalendarView>("week");
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [planSetupMode, setPlanSetupMode] = useState<PlanSetupMode>("build");
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
    setStarterTargetMileage(Math.max(currentMileageEstimate, peakPlanMileage(nextState.context?.structuredPlan) ?? 40));
    setStarterStartDate(nextState.context?.structuredPlan?.startDate ?? nextMondayIsoDate());
    setSelectedPlanPosition(nextState.context?.structuredPlan, currentCalendarWeek(nextState.context?.structuredPlan));
    setGoalsContext(nextGoalsContext);
    setSavedPlanSource(nextPlanSource);
    setSavedPlanVariant(nextPlanVariant);
    setSavedPlanContext(nextPlanContext);
    setSavedStructuredPlan(nextState.context?.structuredPlan);
    setPreviewStructuredPlan(undefined);
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
        activePlanSnapshot: payload.activePlanSnapshot,
        riskFindings: payload.riskFindings
      }));
      const currentMileageEstimate = estimateCurrentMilesPerWeek(payload.summary);
      setStarterTargetMileage((current) => Math.max(current, currentMileageEstimate));
      setStatus(refreshStatusMessage(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      setError(message);
      setStatus("Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function checkToday() {
    const response = await fetch("/api/strava/check-today", { method: "POST" });
    const payload = await parseJsonResponse(response);
    if (!response.ok) throw new Error(payload.status ?? payload.error ?? "Couldn't reach Strava. Plan unchanged.");

    setState((current) => ({
      ...current,
      connected: payload.connected ?? current.connected,
      lastRefreshAt: payload.lastRefreshAt ?? current.lastRefreshAt,
      activities: payload.activities ?? current.activities,
      context: payload.context ?? current.context,
      summary: payload.summary ?? current.summary,
      activePlanSnapshot: payload.activePlanSnapshot ?? current.activePlanSnapshot,
      riskFindings: payload.riskFindings ?? current.riskFindings
    }));
    if (payload.summary) {
      const currentMileageEstimate = estimateCurrentMilesPerWeek(payload.summary);
      setStarterTargetMileage((current) => Math.max(current, currentMileageEstimate));
    }
    setStatus(payload.status ?? "Today checked.");
    return payload.status ?? "Today checked.";
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

  function generatePlan() {
    const result = generateTrainingPlan({
      activities: state.activities,
      goalType: starterGoalType,
      targetPeakMilesPerWeek: starterTargetMileage,
      horizonWeeks: starterPlanWeeks,
      daysPerWeek: starterDaysPerWeek,
      aggression: starterAggression,
      startDate: starterStartDate
    });
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.warnings.join(" "));
      return;
    }
    const previewState = previewGeneratedPlan(planPreviewState(), result.plan);
    setPreviewStructuredPlan(previewState.previewStructuredPlan);
    setError("");
    setStatus(
      result.warnings.length
        ? `${statusText(result.status)} plan preview generated with warnings. ${result.warnings[0]}`
        : `${statusText(result.status)} plan preview generated. Use this plan to make it active.`
    );
  }

  function acceptPreview() {
    const accepted = acceptPreviewPlan(planPreviewState());
    const structuredPlan = accepted.activeStructuredPlan;
    if (!structuredPlan) return;
    setState((current) => ({
      ...current,
      context: {
        ...current.context,
        structuredPlan
      },
      activePlanSnapshot: buildActivePlanSnapshot(structuredPlan, current.activities, {
        localDate: todayIsoDate(),
        completedMilesLast7Days: current.summary.mileageLast7Days
      })
    }));
    setPreviewStructuredPlan(accepted.previewStructuredPlan);
    setPlanSource("custom");
    setPlanVariant(structuredPlan.name);
    setSelectedPlanPosition(structuredPlan, currentCalendarWeek(structuredPlan));
    setStatus("Preview plan is now active. Save plan context to persist it.");
  }

  function discardPreview() {
    const discarded = discardPreviewPlan(planPreviewState());
    setPreviewStructuredPlan(discarded.previewStructuredPlan);
    setStatus("Plan preview discarded. Active plan is unchanged.");
  }

  function adjustPreviewSettings() {
    setIsEditingPlan(true);
    setPlanSetupMode("build");
    setStatus("Adjust settings, then generate a new preview.");
  }

  function planPreviewState(): PlanPreviewState {
    return {
      activeStructuredPlan: state.context?.structuredPlan,
      previewStructuredPlan
    };
  }

  function setSelectedPlanPosition(plan: StructuredTrainingPlan | undefined, weekNumber: number, date = todayIsoDate()) {
    const selectedDate = plan ? clampIsoDateToPlanOrToday(plan, date) : date;
    setSelectedPlanWeek(plan ? weekNumberForDate(plan, parseIsoDate(selectedDate) ?? stripTime(new Date())) : weekNumber);
    setSelectedPlanDate(selectedDate);
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
  const todayDecision = useMemo(
    () =>
      buildTodayDecisionViewModel({
        activePlanSnapshot: state.activePlanSnapshot,
        structuredPlan: state.context?.structuredPlan,
        summary: state.summary,
        riskFindings: state.riskFindings,
        lastRefreshAt: state.lastRefreshAt
      }),
    [state.activePlanSnapshot, state.context?.structuredPlan, state.summary, state.riskFindings, state.lastRefreshAt]
  );

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
          <TodayDecisionView onCheckToday={checkToday} viewModel={todayDecision} />
        ) : (
          <PlanWorkspace
            activities={state.activities}
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
              setSelectedPlanPosition(savedStructuredPlan, currentCalendarWeek(savedStructuredPlan));
              setPreviewStructuredPlan(undefined);
              setIsEditingPlan(false);
            }}
            onAcceptPreview={acceptPreview}
            onAdjustPreview={adjustPreviewSettings}
            onDiscardPreview={discardPreview}
            onEdit={() => setIsEditingPlan(true)}
            onGenerate={generatePlan}
            onSave={() => saveDurableContext("plan")}
            plan={visibleStructuredPlan}
            planCalendarView={planCalendarView}
            planContext={planContext}
            planSetupMode={planSetupMode}
            previewPlan={previewStructuredPlan}
            selectedPlanDate={selectedPlanDate}
            selectedPlanWeek={selectedPlanWeek}
            setPlanCalendarView={setPlanCalendarView}
            setPlanContext={setPlanContext}
            setPlanSetupMode={setPlanSetupMode}
            setPlanSource={setPlanSource}
            setSelectedPlanDate={setSelectedPlanDate}
            setSelectedPlanWeek={setSelectedPlanWeek}
            setStarterAggression={setStarterAggression}
            setStarterDaysPerWeek={setStarterDaysPerWeek}
            setStarterGoalType={setStarterGoalType}
            setStarterPlanWeeks={setStarterPlanWeeks}
            setStarterStartDate={setStarterStartDate}
            setStarterTargetMileage={setStarterTargetMileage}
            starterAggression={starterAggression}
            starterDaysPerWeek={starterDaysPerWeek}
            starterGoalType={starterGoalType}
            starterPlanWeeks={starterPlanWeeks}
            starterStartDate={starterStartDate}
            starterTargetMileage={starterTargetMileage}
          />
        )}
      </section>
    </main>
  );
}

type TweakId = "great" | "tired" | "sore" | "pain" | "schedule" | "behind";

const todayTweakChips: Array<{ id: TweakId; label: string }> = [
  { id: "great", label: "Feeling great" },
  { id: "tired", label: "Low energy" },
  { id: "sore", label: "Sore" },
  { id: "pain", label: "Pain" },
  { id: "schedule", label: "Schedule tight" },
  { id: "behind", label: "Behind plan" }
];

function TodayDecisionView({
  onCheckToday,
  viewModel
}: {
  onCheckToday: () => Promise<string>;
  viewModel: TodayDecisionViewModel;
}) {
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [isCheckingToday, setIsCheckingToday] = useState(false);
  const [selectedTweak, setSelectedTweak] = useState<TweakId | "">("");
  const [todayRefreshStatus, setTodayRefreshStatus] = useState("");
  const heroVariant = viewModel.receipt.items.some((item) => item.tone === "risk")
    ? "strava-error"
    : viewModel.receipt.items.some((item) => item.tone === "caution")
      ? "schedule"
      : "default";
  const evidence = [
    `Assignment: ${viewModel.assignment.distance ?? viewModel.assignment.title}`,
    viewModel.assignment.intensity ? `intensity ${viewModel.assignment.intensity}` : undefined,
    `source ${viewModel.assignment.source}`
  ]
    .filter(Boolean)
    .join(" / ");
  const refreshLine = isCheckingToday
    ? "Checking Strava..."
    : todayRefreshStatus || "Swipe or tap for latest sync";

  async function handleTodayRefresh(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (isCheckingToday) return;
    setIsCheckingToday(true);
    setTodayRefreshStatus("Checking Strava...");
    try {
      const nextStatus = await onCheckToday();
      setTodayRefreshStatus(nextStatus);
    } catch {
      setTodayRefreshStatus("Couldn't reach Strava. Plan unchanged.");
    } finally {
      setIsCheckingToday(false);
    }
  }

  return (
    <section className="todayMockShell todayLiveShell" aria-label="TrainingTweaks Today">
      <section className="todayMockPhone" aria-label="TrainingTweaks Today decision">
        <header className="todayMockHeader">
          <div>
            <p>Good morning</p>
            <strong>TrainingTweaks</strong>
          </div>
          <span>{viewModel.freshness}</span>
        </header>

        <article
          className={`todayMockHero ${heroVariant}`}
          onClick={() => setIsWhyOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsWhyOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="todayMockHeroImage" aria-hidden="true" />
          <div className="todayMockTapHint">
            <span>Why this call?</span>
          </div>
          <div className="todayMockHeroIcon" aria-hidden="true">
            <TodayHeroIcon variant={heroVariant} />
          </div>
          <p>Today's path</p>
          <h2>{viewModel.headline}</h2>
          {viewModel.subheadline ? <p className="todayMockHeroCopy">{viewModel.subheadline}</p> : null}
          <div className="todayMockReceipt" aria-label="Recommendation reasoning receipt">
            <strong>{viewModel.receipt.primary}</strong>
            <span>{viewModel.rationale[0] ?? "Current context is incomplete."}</span>
          </div>
          <div className="todayMockEvidence">{evidence}</div>
          <button
            aria-label="Check Today with Strava"
            className="todayMockSwipe todayMockSwipeButton"
            disabled={isCheckingToday}
            onClick={handleTodayRefresh}
            type="button"
          >
            <i aria-hidden="true" />
            <span>{refreshLine}</span>
          </button>
        </article>

        {isWhyOpen ? (
          <section className="todayMockWhySheet" aria-label="Why this call preview">
            <header>
              <div>
                <h3>Why this call?</h3>
                <p>Deterministic plan, build, and risk context for today's default view.</p>
              </div>
              <button onClick={() => setIsWhyOpen(false)} type="button">
                Close
              </button>
            </header>
            <div className="todayMockWhyList">
              {viewModel.receipt.items.map((item) => (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))}
              {viewModel.rationale.map((item, index) => (
                <div key={`${index}-${item}`}>
                  <strong>{index === 0 ? "Rationale" : "Context"}</strong>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="todayMockTweakCard">
          <div className="todayMockSectionHeader">
            <h3>Considering a tweak today?</h3>
            <p>{selectedTweak ? "Noted locally. Decision logic is unchanged for now." : "No tweak needed? Just run the plan."}</p>
          </div>
          <div className="todayMockChips" aria-label="Optional tweak choices">
            {todayTweakChips.map((chip) => (
              <button
                className={selectedTweak === chip.id ? "active" : ""}
                key={chip.id}
                onClick={() => setSelectedTweak((current) => (current === chip.id ? "" : chip.id))}
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
            <p>{viewModel.confidence ? `${viewModel.confidence} confidence` : "context limited"}</p>
          </div>
          <div className="todayMockWeekPath" aria-label="Week outlook">
            {viewModel.weekPath.map((item) => (
              <div className={weekPathClass(item)} key={item.date}>
                <span />
                <small>{weekPathDateLabel(item.date, item.status)}</small>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
        </section>

        <nav className="todayMockBottomNav" aria-label="Main">
          <a className="active" href="/">
            Today
          </a>
          <a href="/">
            Schedule
          </a>
          <a href="/">
            Progress
          </a>
        </nav>
      </section>
    </section>
  );
}

function TodayHeroIcon({ variant }: { variant: "default" | "schedule" | "strava-error" }) {
  if (variant === "strava-error") {
    return (
      <svg viewBox="0 0 44 44" role="img">
        <path
          d="M22 8.5 37 34.5H7L22 8.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path d="M22 17.5V25.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <circle cx="22" cy="30.5" fill="currentColor" r="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 44 44" role="img">
      <path
        d="M11 25.5c4.7 1.6 9.3 1.2 13.9-1.1 2.4-1.2 4.6-1.6 6.6-1.2 1.4.3 2.5 1.2 3.1 2.5l.8 1.8c.4.9-.2 2-1.2 2.1l-17.7 2.2c-2.9.4-5.7-.8-7.5-3.1l-1.1-1.4c-.7-.9.1-2.2 1.2-1.9l1.9.1Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <path
        d="M16.7 24.9c1.6-3.2 2.5-6.2 2.7-9.1M19.5 21.2l6.1 2.8M22 18.1l5.9 2.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path d="M13.5 32.3h19" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function weekPathClass(item: TodayDecisionViewModel["weekPath"][number]) {
  if (item.status === "today") return "active";
  if (item.status === "done") return "rest";
  if (item.label.toLowerCase().includes("long")) return "long";
  if (item.status === "unknown") return "rest";
  return "easy";
}

function weekPathDateLabel(date: string, status: TodayDecisionViewModel["weekPath"][number]["status"]) {
  if (status === "today") return "Today";
  const parsed = parseIsoDate(date);
  if (!parsed) return date.slice(5);
  return parsed.toLocaleDateString(undefined, { weekday: "short" });
}

function ActivePlanCard({ snapshot }: { snapshot?: ActivePlanSnapshot }) {
  const status = snapshot?.status ?? "no_plan";
  const plannedToday = snapshot?.plannedToday;
  const week = snapshot?.currentPlanWeek;
  const observed = snapshot?.observed;
  const deviation = snapshot?.deviation;

  return (
    <section className="activePlanCard">
      <header>
        <div>
          <p className="eyebrow">Today's plan</p>
          <h3>{plannedToday ? plannedToday.label : activePlanStatusTitle(status)}</h3>
        </div>
        <strong className={`activePlanStatus ${deviation?.status ?? "unknown"}`}>{activePlanDeviationLabel(deviation?.status)}</strong>
      </header>
      {plannedToday ? (
        <div className="activePlanGrid">
          <Metric label="Planned today" value={plannedToday.targetMiles ? `${plannedToday.targetMiles} mi` : plannedToday.type} />
          <Metric label="Intensity" value={plannedToday.intensity} />
          <Metric label="Plan week" value={week ? `${week.weekNumber}/${snapshot?.planDurationWeeks ?? "?"}` : "n/a"} />
          <Metric
            label="Week progress"
            value={`${observed?.completedMilesThisPlanWeek ?? 0} / ${week?.plannedMilesThroughToday ?? 0} mi`}
          />
        </div>
      ) : (
        <p className="muted">{snapshot?.deviation.message ?? "No active structured plan is accepted."}</p>
      )}
      {week ? (
        <p className="muted">
          {snapshot?.planName}: {week.focus}, {week.targetMiles ?? 0} mi week, {week.longRunMiles} mi long run.{" "}
          {observed?.completedMilesLast7Days !== undefined ? `${observed.completedMilesLast7Days} mi in the last 7 days.` : ""}
        </p>
      ) : null}
      {plannedToday && deviation?.message ? <p className="muted">{deviation.message}</p> : null}
    </section>
  );
}

function PlanWorkspace({
  activities,
  isEditingPlan,
  isSavingContext,
  onAcceptPreview,
  onAdjustPreview,
  onCancel,
  onDiscardPreview,
  onEdit,
  onGenerate,
  onSave,
  plan,
  planCalendarView,
  planContext,
  planSetupMode,
  previewPlan,
  selectedPlanDate,
  selectedPlanWeek,
  setPlanCalendarView,
  setPlanContext,
  setPlanSetupMode,
  setPlanSource,
  setSelectedPlanDate,
  setSelectedPlanWeek,
  setStarterAggression,
  setStarterDaysPerWeek,
  setStarterGoalType,
  setStarterPlanWeeks,
  setStarterStartDate,
  setStarterTargetMileage,
  starterAggression,
  starterDaysPerWeek,
  starterGoalType,
  starterPlanWeeks,
  starterStartDate,
  starterTargetMileage
}: {
  activities: Activity[];
  isEditingPlan: boolean;
  isSavingContext: boolean;
  onAcceptPreview: () => void;
  onAdjustPreview: () => void;
  onCancel: () => void;
  onDiscardPreview: () => void;
  onEdit: () => void;
  onGenerate: () => void;
  onSave: () => void;
  plan?: StructuredTrainingPlan;
  planCalendarView: PlanCalendarView;
  planContext: string;
  planSetupMode: PlanSetupMode;
  previewPlan?: StructuredTrainingPlan;
  selectedPlanDate: string;
  selectedPlanWeek: number;
  setPlanCalendarView: (value: PlanCalendarView) => void;
  setPlanContext: (value: string) => void;
  setPlanSetupMode: (value: PlanSetupMode) => void;
  setPlanSource: (value: TrainingPlanSource) => void;
  setSelectedPlanDate: (value: string) => void;
  setSelectedPlanWeek: (value: number) => void;
  setStarterAggression: (value: TrainingPlanGeneratorAggression) => void;
  setStarterDaysPerWeek: (value: number) => void;
  setStarterGoalType: (value: TrainingPlanGeneratorGoal) => void;
  setStarterPlanWeeks: (value: number) => void;
  setStarterStartDate: (value: string) => void;
  setStarterTargetMileage: (value: number) => void;
  starterAggression: TrainingPlanGeneratorAggression;
  starterDaysPerWeek: number;
  starterGoalType: TrainingPlanGeneratorGoal;
  starterPlanWeeks: number;
  starterStartDate: string;
  starterTargetMileage: number;
}) {
  const anchorDate = parseIsoDate(selectedPlanDate) ?? (plan ? planStartDate(plan) : stripTime(new Date()));
  const selectedWeek = plan?.weeks.find((week) => week.weekNumber === selectedPlanWeek) ?? plan?.weeks[0];
  const selectedMetrics = plan && selectedWeek ? plannedWeekMetrics(plan, selectedWeek) : [];
  const calendarDays = plan ? planCalendarDays(plan, planCalendarView, anchorDate, selectedPlanDate, activities) : [];
  const generatorWarnings = plan?.generator?.warnings ?? [];

  function selectCalendarDate(date: Date) {
    if (!plan) return;
    setSelectedPlanDate(isoDate(date));
    setSelectedPlanWeek(weekNumberForDate(plan, date));
  }

  function moveCalendar(direction: -1 | 1) {
    if (!plan) return;
    const next = moveCalendarDate(anchorDate, planCalendarView, direction);
    selectCalendarDate(clampDateToPlan(plan, next));
  }

  function selectToday() {
    if (!plan) return;
    selectCalendarDate(stripTime(new Date()));
  }

  return (
    <section className="planWorkspace">
      <section className="planHero">
        <div>
          <p className="eyebrow">Plan</p>
          <h2>{plan?.name ?? "Build a deterministic plan"}</h2>
          <p>{structuredPlanSummary(plan)}</p>
          {plan?.generator?.status ? <p className="muted">Generator status: {statusText(plan.generator.status)}</p> : null}
          {generatorWarnings.length ? (
            <ul className="planWarnings">
              {generatorWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
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
            <h3>Plan setup</h3>
            <span>{isEditingPlan ? "Editable" : "Locked"}</span>
          </div>
          <div className="planModeTabs" role="tablist" aria-label="Plan setup mode">
            <button
              className={planSetupMode === "choose" ? "active" : ""}
              disabled={!isEditingPlan}
              onClick={() => {
                setPlanSetupMode("choose");
                setPlanSource("other_named");
              }}
              type="button"
            >
              Choose
            </button>
            <button
              className={planSetupMode === "build" ? "active" : ""}
              disabled={!isEditingPlan}
              onClick={() => setPlanSetupMode("build")}
              type="button"
            >
              Build
            </button>
          </div>
          {planSetupMode === "choose" ? (
            <div className="planBuilder">
              <span>Named plan import is experimental</span>
              <p className="muted">Use the deterministic builder for the primary plan path.</p>
            </div>
          ) : (
            <div className="planBuilder">
              <span>Deterministic generator v1</span>
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
                  <span>Goal</span>
                  <select
                    aria-label="Plan goal"
                    disabled={!isEditingPlan}
                    onChange={(event) => setStarterGoalType(event.target.value as TrainingPlanGeneratorGoal)}
                    value={starterGoalType}
                  >
                    <option value="base_builder">Base builder</option>
                    <option value="half_marathon">Half marathon</option>
                    <option value="marathon">Marathon</option>
                  </select>
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
                  <span>Horizon weeks</span>
                  <input
                    aria-label="Plan length weeks"
                    disabled={!isEditingPlan}
                    max={32}
                    min={6}
                    onChange={(event) => setStarterPlanWeeks(Number(event.target.value))}
                    type="number"
                    value={starterPlanWeeks}
                  />
                </label>
                <label>
                  <span>Days / week</span>
                  <input
                    aria-label="Running days per week"
                    disabled={!isEditingPlan}
                    max={6}
                    min={3}
                    onChange={(event) => setStarterDaysPerWeek(Number(event.target.value))}
                    type="number"
                    value={starterDaysPerWeek}
                  />
                </label>
              </div>
              <label>
                <span>Aggression</span>
                  <select
                    aria-label="Plan aggression"
                    disabled={!isEditingPlan}
                  onChange={(event) => setStarterAggression(event.target.value as TrainingPlanGeneratorAggression)}
                  value={starterAggression}
                  >
                  <option value="conservative">conservative</option>
                  <option value="balanced">balanced</option>
                  <option value="aggressive">aggressive</option>
                  </select>
              </label>
              <button className="miniButton" disabled={!isEditingPlan} onClick={onGenerate} type="button">
                Generate plan
              </button>
            </div>
          )}
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
          {previewPlan ? (
            <PlanPreviewPanel
              onAccept={onAcceptPreview}
              onAdjust={onAdjustPreview}
              onDiscard={onDiscardPreview}
              plan={previewPlan}
            />
          ) : null}
          {plan ? (
            <>
              <div className="calendarToolbar" aria-label="Plan calendar controls">
                <button className="calendarArrow" onClick={() => moveCalendar(-1)} type="button" aria-label="Previous period">
                  &lt;
                </button>
                <div>
                  <p className="eyebrow">{calendarViewLabel(planCalendarView)}</p>
                  <h3>{calendarTitle(planCalendarView, anchorDate)}</h3>
                </div>
                <button className="calendarArrow" onClick={() => moveCalendar(1)} type="button" aria-label="Next period">
                  &gt;
                </button>
                <button className="miniButton secondaryMini todayButton" onClick={selectToday} type="button">
                  Today
                </button>
                <label className="calendarCenterDate">
                  <span>Center date</span>
                  <input
                    aria-label="Center date"
                    onChange={(event) => {
                      const date = parseIsoDate(event.target.value);
                      if (date) selectCalendarDate(date);
                    }}
                    type="date"
                    value={selectedPlanDate}
                  />
                </label>
                <label className="calendarViewSelect">
                  <span>View</span>
                  <select
                    aria-label="Calendar view"
                    onChange={(event) => setPlanCalendarView(event.target.value as PlanCalendarView)}
                    value={planCalendarView}
                  >
                    <option value="month">Month</option>
                    <option value="week">Week</option>
                    <option value="window">7 day window</option>
                  </select>
                </label>
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
                  <div className="calendarLegend" aria-label="Calendar workout legend">
                    {calendarLegendItems.map((item) => (
                      <span key={item.kind}>
                        <i className={`calendarTypeDot ${item.kind}`} aria-hidden="true" />
                        {item.label}
                      </span>
                    ))}
                  </div>
                  <div className={`planCalendarGrid ${planCalendarView}`}>
                    {planCalendarView === "month"
                      ? dayOrder.map((day) => (
                          <div className="calendarDayHeader" key={day}>
                            {dayLabel(day)}
                          </div>
                        ))
                      : null}
                    {calendarDays.map((day) => (
                      <button
                        className={`calendarCell ${day.isSelected ? "selected" : ""} ${day.inPlan ? "" : "outsidePlan"} ${day.source} ${day.kind} ${
                          day.source === "planned" && day.workout.type === "rest" ? "restDay" : ""
                        }`}
                        key={day.iso}
                        onClick={() => selectCalendarDate(day.date)}
                        type="button"
                      >
                        <header>
                          <span>{day.dayLabel}</span>
                          <strong>{day.dateLabel}</strong>
                        </header>
                        <div>
                          {day.weekNumber ? <small>{day.badge}</small> : <small>{day.badge}</small>}
                          <div className="calendarCellTitle">
                            <span className={`calendarTypeDot ${day.kind}`} aria-hidden="true" />
                            <h4>{day.title}</h4>
                          </div>
                          <p>{day.value}</p>
                        </div>
                        <small>{day.detail}</small>
                      </button>
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

function PlanPreviewPanel({
  onAccept,
  onAdjust,
  onDiscard,
  plan
}: {
  onAccept: () => void;
  onAdjust: () => void;
  onDiscard: () => void;
  plan: StructuredTrainingPlan;
}) {
  const generator = plan.generator;
  const warnings = generator?.warnings ?? [];
  const rows = weeklyPreviewRows(plan);
  const metrics = [
    { label: "Goal", value: plan.raceDistance ? raceDistanceLabel(plan.raceDistance) : "Base builder" },
    { label: "Status", value: generator?.status ? statusText(generator.status) : "Unknown" },
    { label: "Requested peak", value: `${generator?.inputs.requestedTargetMilesPerWeek ?? "n/a"} MPW` },
    { label: "Generated peak", value: `${generator?.plannedPeakMilesPerWeek ?? peakPlanMileage(plan) ?? "n/a"} MPW` },
    { label: "Peak long run", value: `${peakLongRunMiles(plan)} mi` },
    { label: "Duration", value: `${plan.durationWeeks} weeks` },
    { label: "Days / week", value: generator?.inputs.daysPerWeek ?? "n/a" },
    { label: "Aggression", value: generator?.inputs.aggression ?? "n/a" }
  ];

  return (
    <section className="planPreviewPanel">
      <header className="previewHeader">
        <div>
          <p className="eyebrow">Preview</p>
          <h3>{plan.name}</h3>
          <p>{generator?.status ? `${statusText(generator.status)} preview. Review tradeoffs before replacing the active plan.` : "Review this preview before replacing the active plan."}</p>
        </div>
        <div className="previewActions">
          <button className="miniButton" onClick={onAccept} type="button">
            Use this plan
          </button>
          <button className="miniButton secondaryMini" onClick={onAdjust} type="button">
            Adjust settings
          </button>
          <button className="miniButton secondaryMini" onClick={onDiscard} type="button">
            Discard
          </button>
        </div>
      </header>
      <div className="previewMetricGrid">
        {metrics.map((metric) => (
          <div className="previewMetric" key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      {warnings.length ? (
        <ul className="planWarnings previewWarnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <div className="previewWeekTable">
        <div className="previewWeekHeader">
          <span>Week</span>
          <span>Focus</span>
          <span>Mileage</span>
          <span>Long run</span>
          <span>Workout</span>
          <span>Status</span>
        </div>
        {rows.map((row) => (
          <div className="previewWeekRow" key={row.weekNumber}>
            <span>{row.weekNumber}</span>
            <strong>{row.focus}</strong>
            <span>{row.targetMiles} mi</span>
            <span>{row.longRunMiles} mi</span>
            <span>{row.workoutLabel ?? "None"}</span>
            <span className={`previewSeverity ${row.severity}`}>{row.severity}</span>
          </div>
        ))}
      </div>
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
  const load = assessment("planned_mileage_step");
  const intensity = assessment("planned_quality_density");
  const durability = assessment("planned_long_run_share");

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

function weekDateRange(plan: StructuredTrainingPlan, weekNumber: number) {
  const start = addDays(planStartDate(plan), (weekNumber - 1) * 7);
  const end = addDays(start, 6);
  return `${formatDate(start, { month: "short", day: "numeric" })} - ${formatDate(end, {
    month: "short",
    day: "numeric"
  })}`;
}

function planCalendarDays(
  plan: StructuredTrainingPlan,
  view: PlanCalendarView,
  anchorDate: Date,
  selectedIso: string,
  activities: Activity[]
) {
  const range = calendarRange(view, anchorDate);
  const days = datesBetween(range.start, range.end);
  const actualRunsByDate = actualRunsByIsoDate(activities);
  const today = stripTime(new Date());
  return days.map((date) => {
    const planDay = planWorkoutForDate(plan, date);
    const actualRuns = actualRunsByDate.get(isoDate(date)) ?? [];
    const useActual = date < today || (date.getTime() === today.getTime() && actualRuns.length > 0);
    const actualMiles = round1(actualRuns.reduce((total, activity) => total + milesFromMeters(activity.distanceMeters), 0));
    const actualTitle =
      actualRuns.length === 0
        ? "No run logged"
        : actualRuns.length === 1
          ? actualRuns[0].name ?? "Completed run"
          : `${actualRuns.length} completed runs`;
    const plannedWorkout = planDay?.workout ?? {
      type: "rest" as const,
      label: "Rest",
      intensity: "off" as const,
      purpose: "No planned workout"
    };
    const plannedValue = plannedWorkout.targetMiles
      ? `${plannedWorkout.targetMiles} mi`
      : plannedWorkout.durationMinutes
        ? `${plannedWorkout.durationMinutes} min`
        : "No run";
    return {
      date,
      iso: isoDate(date),
      dayLabel: dayLabel(dayOrder[(date.getDay() + 6) % 7]),
      dateLabel: formatDate(date, { month: "short", day: "numeric" }),
      inPlan: Boolean(planDay),
      isSelected: isoDate(date) === selectedIso,
      weekNumber: planDay?.weekNumber,
      source: useActual ? "actual" : "planned",
      kind: useActual ? (actualRuns.length ? "actual" : "rest") : calendarWorkoutKind(plannedWorkout.type),
      workout: plannedWorkout,
      badge: useActual ? "Actual" : planDay?.weekNumber ? `Week ${planDay.weekNumber}` : "Outside plan",
      title: useActual ? actualTitle : plannedWorkout.label,
      value: useActual ? (actualRuns.length ? `${actualMiles} mi` : "No run logged") : plannedValue,
      detail: useActual
        ? actualRuns.length
          ? actualRuns.map((activity) => formatMiles(activity.distanceMeters)).join(" + ")
          : "No Strava run found"
        : plannedWorkout.purpose
    };
  });
}

function calendarWorkoutKind(type: TrainingPlanWorkoutType): CalendarWorkoutKind {
  if (type === "long_run") return "longRun";
  if (type === "recovery" || type === "easy") return "recovery";
  if (type === "rest") return "rest";
  return "workout";
}

function actualRunsByIsoDate(activities: Activity[]) {
  return activities
    .filter((activity) => activity.sportType.toLowerCase().includes("run"))
    .reduce<Map<string, Activity[]>>((byDate, activity) => {
      const date = activity.startDate.slice(0, 10);
      byDate.set(date, [...(byDate.get(date) ?? []), activity]);
      return byDate;
    }, new Map());
}

function calendarRange(view: PlanCalendarView, anchorDate: Date) {
  if (view === "month") {
    const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return { start: startOfWeek(monthStart), end: endOfWeek(monthEnd) };
  }
  if (view === "window") {
    return { start: addDays(anchorDate, -3), end: addDays(anchorDate, 3) };
  }
  return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
}

function planWorkoutForDate(plan: StructuredTrainingPlan, date: Date) {
  const start = planStartDate(plan);
  const deltaDays = Math.floor((stripTime(date).getTime() - start.getTime()) / millisecondsPerDay);
  if (deltaDays < 0 || deltaDays >= plan.durationWeeks * 7) return undefined;
  const weekNumber = Math.floor(deltaDays / 7) + 1;
  const dayOfWeek = dayOrder[deltaDays % 7];
  const week = plan.weeks.find((candidate) => candidate.weekNumber === weekNumber);
  const workout = week?.days.find((day) => day.dayOfWeek === dayOfWeek)?.workout ?? {
    type: "rest" as const,
    label: "Rest",
    intensity: "off" as const,
    purpose: "No run scheduled"
  };
  return { weekNumber, dayOfWeek, workout };
}

function moveCalendarDate(anchorDate: Date, view: PlanCalendarView, direction: -1 | 1) {
  if (view === "month") {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
  }
  return addDays(anchorDate, direction * 7);
}

function clampDateToPlan(plan: StructuredTrainingPlan, date: Date) {
  const start = planStartDate(plan);
  const end = addDays(start, plan.durationWeeks * 7 - 1);
  if (date < start) return start;
  if (date > end) return end;
  return stripTime(date);
}

function weekNumberForDate(plan: StructuredTrainingPlan, date: Date) {
  const deltaDays = Math.floor((stripTime(date).getTime() - planStartDate(plan).getTime()) / millisecondsPerDay);
  return Math.min(plan.durationWeeks, Math.max(1, Math.floor(deltaDays / 7) + 1));
}

function calendarTitle(view: PlanCalendarView, anchorDate: Date) {
  if (view === "month") return formatDate(anchorDate, { month: "long", year: "numeric" });
  const range = calendarRange(view, anchorDate);
  return `${formatDate(range.start, { month: "short", day: "numeric" })} - ${formatDate(range.end, {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}

function calendarViewLabel(view: PlanCalendarView) {
  if (view === "window") return "7 day window";
  return view;
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

function planWeekStartDate(plan: StructuredTrainingPlan, weekNumber: number) {
  return addDays(planStartDate(plan), (weekNumber - 1) * 7);
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

function todayIsoDate() {
  return isoDate(stripTime(new Date()));
}

function clampIsoDateToPlanOrToday(plan: StructuredTrainingPlan, value: string) {
  const selected = parseIsoDate(value) ?? stripTime(new Date());
  const today = stripTime(new Date());
  if (selected.getTime() === today.getTime()) return isoDate(today);
  return isoDate(clampDateToPlan(plan, selected));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const next = stripTime(date);
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  return next;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function datesBetween(start: Date, end: Date) {
  const days = [];
  for (let date = stripTime(start); date <= end; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
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
  if (groupId === "context" && metrics.some((metric) => metric.ruleId === "adaptation_context" && metric.finding?.framework?.adaptation?.classification === "low")) return "de-training";
  if (groupId === "exposure" && (metrics[1]?.finding?.observedValue ?? 1) === 0) return "de-training";
  return "productive";
}

function groupSummary(groupId: string, status: TrainingStatus) {
  if (status === "high-risk") {
    if (groupId === "context") return "Observed risk should dominate today's decision.";
    if (groupId === "exposure") return "Recent exposure is unusually demanding.";
    return "Novelty is high relative to current adaptation.";
  }
  if (status === "risky") {
    if (groupId === "context") return "Capacity and adaptation need careful interpretation.";
    if (groupId === "exposure") return "Recent exposure has one watch item.";
    return "Some exposure is unusual versus the adaptation baseline.";
  }
  if (status === "de-training") {
    if (groupId === "context") return "Current adaptation is below durable capacity.";
    if (groupId === "exposure") return "Recent mechanical exposure is light.";
    return "Novelty is low because recent exposure is light.";
  }
  if (groupId === "context") return "Capacity, adaptation, and observed risk are aligned.";
  if (groupId === "exposure") return "Cardio and mechanical exposure are readable.";
  return "Recent exposure is close to current adaptation.";
}

function statusLabel(status: TrainingStatus) {
  if (status === "de-training") return "De-training";
  if (status === "high-risk") return "High risk";
  return status[0].toUpperCase() + status.slice(1);
}

function activePlanStatusTitle(status: ActivePlanSnapshot["status"]) {
  if (status === "before_plan") return "Plan has not started";
  if (status === "after_plan") return "Plan has ended";
  if (status === "invalid_plan") return "Plan date issue";
  return "No active plan";
}

function refreshStatusMessage(payload: {
  importedCount?: number;
  fetchedCount?: number;
  activityFetch?: { pageCount?: number; mode?: string };
  detailSync?: { failedCount?: number; remainingCount?: number };
  streamSync?: { failedCount?: number; unavailableCount?: number; rateLimited?: boolean; mode?: string };
}) {
  const importedCount = payload.importedCount ?? 0;
  const fetchedCount = payload.fetchedCount ?? importedCount;
  const pageCount = payload.activityFetch?.pageCount ?? 0;
  const base =
    importedCount > 0
      ? `Imported ${importedCount} new Strava activit${importedCount === 1 ? "y" : "ies"}.`
      : fetchedCount > 0
        ? "Checked recent Strava activity; no new activities were added."
        : "Checked Strava; no recent activities found.";
  const detailLimited = (payload.detailSync?.failedCount ?? 0) > 0 || (payload.detailSync?.remainingCount ?? 0) > 0;
  const streamLimited =
    (payload.streamSync?.failedCount ?? 0) > 0 ||
    (payload.streamSync?.unavailableCount ?? 0) > 0 ||
    Boolean(payload.streamSync?.rateLimited);
  const enrichment = detailLimited || streamLimited ? " Some detail/stream enrichment was limited." : "";
  return `${base} Refresh checked ${pageCount} page${pageCount === 1 ? "" : "s"}.${enrichment}`;
}

function activePlanDeviationLabel(status: ActivePlanSnapshot["deviation"]["status"] | undefined) {
  if (status === "on_track") return "On track";
  if (status === "ahead") return "Ahead";
  if (status === "behind") return "Behind";
  return "Unknown";
}

function statusText(status: "feasible" | "compromised" | "not_recommended") {
  if (status === "not_recommended") return "Not recommended";
  return status[0].toUpperCase() + status.slice(1);
}

function raceDistanceLabel(distance: NonNullable<StructuredTrainingPlan["raceDistance"]>) {
  if (distance === "half_marathon") return "Half marathon";
  if (distance === "marathon") return "Marathon";
  return distance.toUpperCase();
}

function metricSeverity(finding: RiskFinding | undefined): "green" | "yellow" | "red" {
  if (finding?.severity === "red") return "red";
  if (finding?.severity === "yellow") return "yellow";
  return "green";
}

function metricValue(ruleId: string, finding: RiskFinding | undefined, summary: ActivitySummary) {
  if (finding) {
    const observed = finding.observedValue;
    if (ruleId === "capacity_context") return finding.framework?.capacity?.classification ?? "unknown";
    if (ruleId === "adaptation_context") return finding.framework?.adaptation?.classification ?? "unknown";
    if (ruleId === "decision_risk_observed") return observed === undefined ? "clear" : `${observed} driver${observed === 1 ? "" : "s"}`;
    if (ruleId === "cardio_load_7d") return observed === undefined ? "n/a" : `${round2(observed)}`;
    if (ruleId === "mechanical_exposure_7d") return observed === undefined ? "n/a" : `${round2(observed)} mi`;
    if (ruleId.endsWith("_novelty")) return noveltyValue(finding);
    return observed === undefined ? "n/a" : `${round2(observed)} ${finding.unit ?? ""}`.trim();
  }

  if (ruleId === "mechanical_exposure_7d") return `${summary.mileageLast7Days} mi / 7d`;

  return "n/a";
}

function metricDetail(ruleId: string, finding: RiskFinding | undefined, summary: ActivitySummary) {
  if (finding) {
    if (ruleId === "capacity_context") return `${finding.framework?.capacity?.historicalPeakWeeklyMileage ?? "n/a"} peak mpw`;
    if (ruleId === "adaptation_context") return `${finding.framework?.adaptation?.mileagePerWeek28Days ?? "n/a"} current mpw`;
    if (ruleId === "cardio_load_7d") return finding.framework?.cardioLoad?.cardioLoadSource ?? "unknown source";
    if (ruleId === "mechanical_exposure_7d") return `${finding.framework?.mechanicalExposure?.longestRunMiles ?? summary.longestRunLast14DaysMiles} mi long`;
    if (ruleId.endsWith("_novelty")) return noveltyDetail(finding);
    if (ruleId === "decision_risk_observed") return "observed, not planned";
    return finding.confidence;
  }

  return "waiting on data";
}

function noveltyValue(finding: RiskFinding) {
  const signal = finding.evidence.noveltySignal as { currentValue?: number; unit?: string } | undefined;
  if (!signal || signal.currentValue === undefined) return "n/a";
  if (signal.unit === "seconds") return `${Math.round(signal.currentValue / 60)} min`;
  return `${round2(signal.currentValue)} ${signal.unit ?? ""}`.trim();
}

function noveltyDetail(finding: RiskFinding) {
  const signal = finding.evidence.noveltySignal as { baselineValue?: number; unit?: string; source?: string } | undefined;
  if (!signal) return finding.confidence;
  const baseline = signal.baselineValue === undefined ? "n/a" : signal.unit === "seconds" ? `${Math.round(signal.baselineValue / 60)} min` : `${round2(signal.baselineValue)} ${signal.unit ?? ""}`.trim();
  return `baseline ${baseline}, ${signal.source ?? finding.confidence}`;
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
  return `${milesFromMeters(meters)} mi`;
}

function milesFromMeters(meters?: number) {
  if (!meters) return 0;
  return Math.round((meters / 1609.344) * 10) / 10;
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
