import Link from "next/link";
import { notFound } from "next/navigation";
import { getTokenContext } from "@/lib/tokens/queries";
import { WORKFLOW_COMPLETE } from "@/lib/workflow/types";
import type { AgreementField } from "@/lib/vision/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function OwnerTokenPage({ params }: PageProps) {
  const { token } = await params;
  const ctx = await getTokenContext(token);
  if (!ctx) notFound();

  const { agreement, submission, role } = ctx;
  const schema = agreement.schema;
  const isComplete = submission.currentStepIndex === WORKFLOW_COMPLETE;
  const currentStep =
    submission.currentStepIndex === WORKFLOW_COMPLETE
      ? null
      : agreement.workflowSteps[submission.currentStepIndex] ?? null;

  const data = submission.data as Record<string, unknown>;
  const fmtDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const createdLabel = fmtDate.format(submission.createdAt);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:px-6">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {agreement.schema.documentType}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight leading-tight">
            {agreement.schema.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
              {role}
            </span>
            <span>Submitted {createdLabel}</span>
          </div>
        </header>

        <div className="bg-white border border-neutral-200 rounded-lg p-6 mb-6">
          {isComplete ? (
            <CompleteBanner />
          ) : currentStep ? (
            <InProgressBanner
              stepIndex={submission.currentStepIndex}
              totalSteps={agreement.workflowSteps.length}
              stepLabel={currentStep.label}
            />
          ) : (
            <div className="text-sm text-neutral-500">No workflow steps defined.</div>
          )}
        </div>

        <section className="bg-white border border-neutral-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-4">
            What you submitted
          </h2>
          <dl className="space-y-3 text-sm">
            {schema.fields.map((f) => (
              <SubmittedRow key={f.id} field={f} value={data[f.id]} />
            ))}
            {schema.fieldGroups.flatMap((group) =>
              Array.from({ length: group.initialInstances }, (_, i) => (
                <div key={`${group.id}-${i}`} className="pt-3 border-t border-neutral-100 first:border-t-0">
                  <div className="text-xs text-neutral-500 mb-1">
                    {group.label} · #{i + 1}
                  </div>
                  {group.template.map((f) => (
                    <SubmittedRow
                      key={`${group.id}-${i}-${f.id}`}
                      field={f}
                      value={data[`${group.id}__${i}__${f.id}`]}
                    />
                  ))}
                </div>
              )),
            )}
          </dl>
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-4">
            Signatures
          </h2>
          <div className="space-y-3">
            {agreement.schema.signatureBlocks.map((block) => {
              const signerRole = block.signerRole ?? "self";
              const statusText =
                signerRole === "pre-signed"
                  ? "Already signed on the source document"
                  : signerRole === "counterparty"
                    ? "Awaiting counterparty"
                    : "Signature pending — capture in Phase E";
              return (
                <div
                  key={block.id}
                  className="flex items-baseline justify-between border border-neutral-100 rounded-md px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{block.role}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{statusText}</div>
                  </div>
                  <span className="text-xs font-mono text-neutral-400">{signerRole}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-2">
            Download
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            The fully-rendered, signed PDF will appear here when Phase D + E ship.
          </p>
          <button
            disabled
            className="inline-flex items-center justify-center bg-neutral-200 text-neutral-500 rounded-md px-4 py-2 text-sm font-medium cursor-not-allowed"
          >
            Download PDF (not yet available)
          </button>
        </section>

        <footer className="mt-10 flex items-center justify-between text-xs text-neutral-500">
          <div>
            This URL is your private access link. Anyone with it can view this
            submission — share carefully.
          </div>
          <Link
            href={`/a/${agreement.shortId}`}
            className="underline hover:text-neutral-700"
          >
            Back to form
          </Link>
        </footer>
      </div>
    </main>
  );
}

function CompleteBanner() {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <div>
        <div className="font-medium">Workflow complete</div>
        <div className="text-sm text-neutral-600 mt-0.5">
          All required steps are done. The final document is ready.
        </div>
      </div>
    </div>
  );
}

function InProgressBanner({
  stepIndex,
  totalSteps,
  stepLabel,
}: {
  stepIndex: number;
  totalSteps: number;
  stepLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-medium">{stepLabel}</div>
        <div className="text-xs text-neutral-500 font-mono">
          Step {stepIndex + 1} of {totalSteps}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${(stepIndex / totalSteps) * 100}%` }}
        />
      </div>
      <div className="text-sm text-neutral-600 mt-3">
        Your values are saved. The next action — signature capture — will be
        available when Phase E ships.
      </div>
    </div>
  );
}

function SubmittedRow({ field, value }: { field: AgreementField; value: unknown }) {
  const display = formatValue(field, value);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-600 flex-shrink-0 min-w-0 max-w-[45%]">
        <span className="truncate block">{field.label}</span>
      </dt>
      <dd className={`text-neutral-900 font-medium text-right min-w-0 ${display ? "" : "text-neutral-400 italic"}`}>
        <span className="truncate">{display ?? "—"}</span>
      </dd>
    </div>
  );
}

function formatValue(field: AgreementField, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length ? value : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toString();
  if (typeof value === "object" && "name" in (value as Record<string, unknown>)) {
    return (value as { name: string }).name;
  }
  return JSON.stringify(value);
}
