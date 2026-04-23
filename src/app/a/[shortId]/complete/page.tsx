import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgreementByShortId } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ shortId: string }>;
  searchParams: Promise<{ submission?: string }>;
}

export default async function CompletePage({ params, searchParams }: PageProps) {
  const [{ shortId }, { submission }] = await Promise.all([params, searchParams]);
  const agreement = await getAgreementByShortId(shortId);
  if (!agreement) notFound();

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-2xl mx-auto px-5 py-16 sm:px-6">
        <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Submission received</h1>
          <p className="mt-2 text-neutral-600">
            Thanks for completing <span className="font-medium">{agreement.schema.title}</span>.
          </p>

          {submission && (
            <div className="mt-6 text-xs text-neutral-500">
              Submission ID: <code className="font-mono">{submission}</code>
            </div>
          )}

          <div className="mt-8 rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3 text-left text-sm text-neutral-700">
            <div className="font-medium text-neutral-800 mb-1">What happens next</div>
            The signed agreement PDF (matching the look of the original document)
            will be produced in the next build phase. For now, your submitted
            values are safely stored.
          </div>

          <div className="mt-8 flex gap-3 justify-center">
            <Link
              href={`/a/${agreement.shortId}`}
              className="inline-flex items-center justify-center border border-neutral-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-neutral-100 transition"
            >
              Back to agreement
            </Link>
            <button
              disabled
              className="inline-flex items-center justify-center bg-neutral-200 text-neutral-500 rounded-md px-4 py-2 text-sm font-medium cursor-not-allowed"
              title="Coming in Phase B full"
            >
              Download signed PDF (Phase C)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
