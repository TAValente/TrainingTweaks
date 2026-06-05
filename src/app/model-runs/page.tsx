"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoredModelRun } from "@/lib/types";

type ModelRunFilter = "all" | "positive" | "negative" | "unreviewed" | "errors";

type ModelRunsResponse = {
  count: number;
  modelRuns: StoredModelRun[];
  totalRetained: number;
};

export default function ModelRunsPage() {
  const [expandedId, setExpandedId] = useState("");
  const [filter, setFilter] = useState<ModelRunFilter>("all");
  const [modelRuns, setModelRuns] = useState<StoredModelRun[]>([]);
  const [status, setStatus] = useState("Loading model runs...");
  const [error, setError] = useState("");

  useEffect(() => {
    loadModelRuns();
  }, []);

  async function loadModelRuns() {
    setError("");
    setStatus("Loading model runs...");

    try {
      const response = await fetch("/api/model-runs?limit=100", { cache: "no-store" });
      const payload = (await parseJsonResponse(response)) as Partial<ModelRunsResponse> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load model runs.");

      setModelRuns(payload.modelRuns ?? []);
      setStatus(`Loaded ${payload.count ?? 0} of ${payload.totalRetained ?? 0} retained model runs.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load model runs.";
      setError(message);
      setStatus("Model runs failed to load.");
    }
  }

  const filteredRuns = useMemo(
    () =>
      modelRuns.filter((modelRun) => {
        if (filter === "positive") return modelRun.feedback?.rating === "positive";
        if (filter === "negative") return modelRun.feedback?.rating === "negative";
        if (filter === "unreviewed") return !modelRun.feedback && !modelRun.error;
        if (filter === "errors") return Boolean(modelRun.error);
        return true;
      }),
    [filter, modelRuns]
  );

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">TrainingTweaks</p>
          <h1>Review model runs.</h1>
        </div>
        <div className="actions">
          <a className="button secondary" href="/">
            Chat
          </a>
          <a className="button" href="/api/model-runs?export=json">
            Export JSON
          </a>
        </div>
      </section>

      <section className="statusLine" aria-live="polite">
        <span className={error ? "dot" : "dot connected"} />
        {status}
      </section>
      {error ? <section className="errorLine">{error}</section> : null}

      <section className="reviewToolbar">
        <label>
          <span>Filter</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as ModelRunFilter)}>
            <option value="all">All runs</option>
            <option value="positive">Helpful</option>
            <option value="negative">Not helpful</option>
            <option value="unreviewed">No feedback</option>
            <option value="errors">Errors</option>
          </select>
        </label>
        <button className="button secondary" onClick={loadModelRuns} type="button">
          Refresh
        </button>
      </section>

      <section className="runList">
        {filteredRuns.length ? (
          filteredRuns.map((modelRun) => (
            <article className="runItem" key={modelRun.id}>
              <header className="runHeader">
                <div>
                  <p className="runMeta">
                    {new Date(modelRun.timestamp).toLocaleString()} · {modelRun.model ?? "unknown model"}
                  </p>
                  <h2>{modelRun.question}</h2>
                </div>
                <FeedbackBadge modelRun={modelRun} />
              </header>

              <p className="runAnswer">{modelRun.error?.message ?? modelRun.renderedAnswer ?? "No rendered answer."}</p>

              {modelRun.feedback?.note ? (
                <p className="runFeedbackNote">Feedback: {modelRun.feedback.note}</p>
              ) : null}

              <button
                className="miniButton secondaryMini"
                onClick={() => setExpandedId(expandedId === modelRun.id ? "" : modelRun.id)}
                type="button"
              >
                {expandedId === modelRun.id ? "Hide details" : "Show details"}
              </button>

              {expandedId === modelRun.id ? (
                <pre className="runDetails">{JSON.stringify(detailPayload(modelRun), null, 2)}</pre>
              ) : null}
            </article>
          ))
        ) : (
          <article className="runItem">
            <p className="muted">No model runs match this filter.</p>
          </article>
        )}
      </section>
    </main>
  );
}

function FeedbackBadge({ modelRun }: { modelRun: StoredModelRun }) {
  if (modelRun.error) return <span className="runBadge error">Error</span>;
  if (modelRun.feedback?.rating === "positive") return <span className="runBadge positive">Helpful</span>;
  if (modelRun.feedback?.rating === "negative") return <span className="runBadge negative">Not helpful</span>;
  return <span className="runBadge">No feedback</span>;
}

function detailPayload(modelRun: StoredModelRun) {
  return {
    id: modelRun.id,
    timestamp: modelRun.timestamp,
    question: modelRun.question,
    feedback: modelRun.feedback,
    trainingContext: modelRun.trainingContext,
    runningContext: modelRun.runningContext,
    openAIRequest: modelRun.openAIRequest,
    rawModelResponse: modelRun.rawModelResponse,
    renderedAnswer: modelRun.renderedAnswer,
    error: modelRun.error
  };
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
