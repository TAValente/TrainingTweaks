import { notFound } from "next/navigation";
import {
  createScenarioAuditInspections,
  formatScenarioAuditInspection
} from "@/lib/audit-scenario-inspection";
import {
  auditTensionEvidenceLabel,
  auditTensionPostureLabel,
  auditTensionRecommendationLabel
} from "@/lib/audit-browser-format";
import { canInspectSyntheticAuditReports } from "@/lib/dev-audit-access";

export const dynamic = "force-dynamic";

export default function AuditScenariosPage() {
  if (!canInspectSyntheticAuditReports()) notFound();

  const inspections = createScenarioAuditInspections();

  return (
    <main className="auditInspectionShell">
      <header className="auditInspectionHeader">
        <p className="eyebrow">Synthetic inspection</p>
        <h1>Recommendation Audit Reports</h1>
        <p>
          Five fixture scenarios rendered from the existing trace, fulfillment match, and audit report flow. Learning
          remains disabled.
        </p>
      </header>

      <section className="auditScenarioList" aria-label="Synthetic scenario audit reports">
        {inspections.map((inspection) => {
          const { scenario, report } = inspection;

          return (
            <article className="auditScenario" key={scenario.id}>
              <header className="auditScenarioHeader">
                <div>
                  <p className="auditScenarioId">{scenario.id}</p>
                  <h2>{scenario.title}</h2>
                </div>
                <strong>{report.fulfillmentStatus}</strong>
              </header>

              <dl className="auditFieldGrid">
                <div>
                  <dt>Question</dt>
                  <dd>{report.question}</dd>
                </div>
                <div>
                  <dt>Recommendation</dt>
                  <dd>{report.recommendationSummary}</dd>
                </div>
                <div>
                  <dt>Expected action / exposure</dt>
                  <dd>
                    {report.expectedAction.intent}; {report.expectedAction.exposure}
                  </dd>
                </div>
                {report.expectedAction.scheduleTolerance ? (
                  <div>
                    <dt>Schedule tolerance</dt>
                    <dd>{report.expectedAction.scheduleTolerance}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Actual action / exposure</dt>
                  <dd>{report.actualAction.summary}</dd>
                </div>
                <div>
                  <dt>Learning eligible</dt>
                  <dd>{report.learningEligible ? "yes" : "no"}</dd>
                </div>
              </dl>

              <section className="auditSubsection">
                <h3>Tensions and Evidence</h3>
                {report.tensionSummary.map((tension) => (
                  <div className="auditTension" key={tension.tensionId}>
                    <h4>{tension.tensionId}</h4>
                    <p>{auditTensionRecommendationLabel(tension)}</p>
                    <p>{auditTensionPostureLabel(tension)}</p>
                    {tension.rationale ? <p>{tension.rationale}</p> : null}
                    <ul>
                      {tension.evidence.map((evidence) => (
                        <li key={`${evidence.source}-${evidence.side}-${evidence.createdAt}`}>
                          {auditTensionEvidenceLabel(tension, evidence)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>

              <section className="auditSubsection">
                <h3>Caveats</h3>
                <ul>
                  {report.caveats.map((caveat) => (
                    <li key={caveat}>{caveat}</li>
                  ))}
                </ul>
              </section>

              <details className="auditRawReport">
                <summary>Formatted report text</summary>
                <pre>{formatScenarioAuditInspection(inspection)}</pre>
              </details>
            </article>
          );
        })}
      </section>
    </main>
  );
}
