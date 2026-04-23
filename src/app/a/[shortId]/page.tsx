import { notFound } from "next/navigation";
import { getAgreementByShortId } from "@/lib/db/queries";
import { FormRenderer } from "@/components/form-renderer/FormRenderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ shortId: string }>;
}

export default async function AgreementPage({ params }: PageProps) {
  const { shortId } = await params;
  const agreement = await getAgreementByShortId(shortId);

  if (!agreement) {
    notFound();
  }

  const fmtDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(agreement.createdAt);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:px-6 sm:py-16">
        <header className="mb-10">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {agreement.schema.documentType}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight leading-tight">
            {agreement.schema.title}
          </h1>
          {agreement.schema.purpose && (
            <p className="mt-3 text-neutral-600 leading-relaxed">
              {agreement.schema.purpose}
            </p>
          )}
          <div className="mt-4 text-xs text-neutral-400">
            Prepared {fmtDate} · <code className="font-mono">{agreement.shortId}</code>
          </div>
        </header>

        <FormRenderer
          agreementId={agreement.id}
          shortId={agreement.shortId}
          schema={agreement.schema}
          lowConfidenceFieldIds={agreement.lowConfidenceFieldIds}
        />
      </div>
    </main>
  );
}
