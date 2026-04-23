import { notFound } from "next/navigation";
import { getAgreementByShortId } from "@/lib/db/queries";
import { getDb, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { WORKFLOW_COMPLETE, type WorkflowTransition } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ shortId: string }>;
  searchParams: Promise<{ submission?: string }>;
}

export default async function ComparePage({ params, searchParams }: PageProps) {
  // Dev-only guardrail — gate in production so we don't leak ingested content.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [{ shortId }, { submission: submissionId }] = await Promise.all([params, searchParams]);
  const agreement = await getAgreementByShortId(shortId);
  if (!agreement) notFound();

  const db = getDb();
  const submissions = submissionId
    ? await db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, submissionId))
        .limit(1)
    : await db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.agreementId, agreement.id))
        .orderBy(desc(schema.submissions.createdAt))
        .limit(1);

  const submission = submissions[0] ?? null;
  const sourceUrl = `/api/storage/${agreement.sourcePath}`;

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="bg-white border-b border-neutral-200 px-6 py-3 flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Compare · dev-only
          </div>
          <h1 className="text-lg font-semibold">{agreement.schema.title}</h1>
        </div>
        <div className="text-xs text-neutral-500 font-mono">{agreement.shortId}</div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-[calc(100vh-64px)]">
        <section className="border-r border-neutral-200 bg-white">
          <div className="px-6 py-3 border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            Original source ({agreement.sourceKind})
          </div>
          <div className="p-4">
            {agreement.sourceKind === "pdf" ? (
              <object data={sourceUrl} type="application/pdf" className="w-full h-[80vh]">
                <a href={sourceUrl}>Open source PDF</a>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceUrl}
                alt="Original"
                className="max-w-full h-auto border border-neutral-200 rounded"
              />
            )}
          </div>
        </section>

        <section className="bg-white">
          <div className="px-6 py-3 border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            Extracted schema + submission
          </div>
          <div className="p-6 space-y-6 text-sm">
            <div>
              <h3 className="font-medium text-neutral-700 mb-2">Fields ({agreement.schema.fields.length})</h3>
              <div className="space-y-1.5">
                {agreement.schema.fields.map((f) => {
                  const value =
                    submission && typeof submission.dataJson === "object"
                      ? (submission.dataJson as Record<string, unknown>)[f.id]
                      : undefined;
                  return (
                    <div key={f.id} className="flex items-center justify-between border border-neutral-100 rounded px-3 py-1.5">
                      <span className="truncate mr-3">{f.label}</span>
                      <span className="font-mono text-xs text-neutral-500 flex-shrink-0">
                        {value === undefined || value === null || value === ""
                          ? "—"
                          : typeof value === "object"
                            ? JSON.stringify(value).slice(0, 40)
                            : String(value).slice(0, 40)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {submission ? (
              <div className="text-xs text-neutral-500">
                Submission <code className="font-mono">{submission.id}</code> · status: {submission.status}
              </div>
            ) : (
              <div className="text-xs text-neutral-400">No submissions yet.</div>
            )}

            <div>
              <h3 className="font-medium text-neutral-700 mb-2">
                Workflow ({agreement.workflowSteps.length} {agreement.workflowSteps.length === 1 ? "step" : "steps"})
              </h3>
              <div className="space-y-1.5">
                {agreement.workflowSteps.map((step) => {
                  const isActive = submission
                    ? submission.currentStepIndex === step.order
                    : false;
                  const isDone = submission
                    ? submission.currentStepIndex === WORKFLOW_COMPLETE ||
                      submission.currentStepIndex > step.order
                    : false;
                  const chipClass = isActive
                    ? "bg-emerald-100 text-emerald-900"
                    : isDone
                      ? "bg-neutral-200 text-neutral-600"
                      : "bg-neutral-50 text-neutral-500";
                  return (
                    <div
                      key={step.id}
                      className="flex items-center justify-between border border-neutral-100 rounded px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${chipClass}`}>
                          #{step.order + 1}
                        </span>
                        <span className="truncate">{step.label}</span>
                      </div>
                      <span className="font-mono text-xs text-neutral-500 flex-shrink-0">
                        {step.role}
                        {step.requiredSignatureBlockIds.length > 0 && ` · ${step.requiredSignatureBlockIds.length}🖊`}
                      </span>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const history = (submission?.historyJson as WorkflowTransition[] | null) ?? [];
                if (history.length === 0) return null;
                return (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-neutral-500">
                      Transition history ({history.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {history.map((t, i) => (
                        <li key={i} className="flex items-center gap-2 text-neutral-600">
                          <span className="font-mono text-neutral-400">
                            {new Date(t.at).toLocaleTimeString()}
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-neutral-100 text-neutral-700">
                            {t.action}
                          </span>
                          <span>
                            {t.fromStepIndex === null ? "∅" : String(t.fromStepIndex)}
                            {" → "}
                            {t.toStepIndex === WORKFLOW_COMPLETE
                              ? "✓"
                              : t.toStepIndex === null
                                ? "∅"
                                : String(t.toStepIndex)}
                          </span>
                          {t.notes && <span className="text-neutral-500 italic">— {t.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })()}
            </div>

            <details>
              <summary className="cursor-pointer text-neutral-600 font-medium">
                Full extracted schema JSON
              </summary>
              <pre className="mt-3 text-xs overflow-x-auto bg-neutral-50 rounded border border-neutral-200 p-3">
{JSON.stringify(agreement.schema, null, 2)}
              </pre>
            </details>

            <details>
              <summary className="cursor-pointer text-neutral-600 font-medium">
                Style fingerprint JSON
              </summary>
              <pre className="mt-3 text-xs overflow-x-auto bg-neutral-50 rounded border border-neutral-200 p-3">
{JSON.stringify(agreement.styleFingerprint, null, 2)}
              </pre>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
