import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-5xl font-semibold tracking-tight">Signflo</h1>
        <p className="mt-4 text-xl text-neutral-600 leading-relaxed">
          Point your phone at any document. Get back a live signable
          agreement — plus the repo that powers it, yours forever.
        </p>

        <div className="mt-12 flex gap-3">
          <Link
            href="/ingest"
            className="inline-flex items-center justify-center bg-neutral-900 text-white rounded-lg px-6 py-3 font-medium hover:bg-neutral-800 transition"
          >
            Try the ingestion spike →
          </Link>
          <a
            href="https://github.com/signflo/signflo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center border border-neutral-300 text-neutral-900 rounded-lg px-6 py-3 font-medium hover:bg-neutral-100 transition"
          >
            GitHub
          </a>
        </div>

        <div className="mt-16 text-sm text-neutral-500 border-t border-neutral-200 pt-8">
          <div>Built in public · Week of April 21–27, 2026</div>
          <div className="mt-1">Powered by Claude Opus 4.7</div>
        </div>
      </div>
    </main>
  );
}
