"use client";

import { useState } from "react";

interface Field {
  id: string;
  label: string;
  type: string;
  required: boolean;
  confidence: number;
}

interface IngestResponse {
  agreementId: string;
  shortId: string;
  schema: {
    title: string;
    documentType: string;
    fields: Field[];
    signatureBlocks: Array<{ id: string; role: string; order: number }>;
  };
  styleFingerprint: unknown;
  lowConfidenceFieldIds: string[];
  elapsedMs: number;
}

export default function IngestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
      } else {
        // Defensive normalization: the API should always return a well-formed
        // shape, but a bad Opus tool-call response could surface as nested
        // keys. Falling back to empty arrays here prevents a runtime crash
        // on display.
        const normalized: IngestResponse = {
          ...body,
          schema: {
            title: body.schema?.title ?? "Untitled agreement",
            documentType: body.schema?.documentType ?? "document",
            fields: body.schema?.fields ?? [],
            signatureBlocks: body.schema?.signatureBlocks ?? [],
          },
          lowConfidenceFieldIds: body.lowConfidenceFieldIds ?? [],
        };
        setResult(normalized);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const lowConfidenceSet = new Set(result?.lowConfidenceFieldIds ?? []);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Signflo — Ingest</h1>
          <p className="text-neutral-600 mt-2 text-sm">
            Upload a phone photo or digital PDF of an agreement. Opus 4.7 extracts fields, signature blocks, and a visual style fingerprint.
          </p>
        </header>

        <form onSubmit={handleUpload} className="mb-8">
          <label
            htmlFor="file-input"
            className="block border-2 border-dashed border-neutral-300 rounded-lg p-10 text-center cursor-pointer hover:bg-neutral-100 transition"
          >
            <input
              id="file-input"
              type="file"
              accept="image/*,application/pdf,.pdf,.heic,.heif"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {file ? (
              <div>
                <div className="font-medium">{file.name}</div>
                <div className="text-sm text-neutral-500 mt-1">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium">Drop an image or PDF here</div>
                <div className="text-sm text-neutral-500 mt-1">
                  Or tap to select from your device / take a photo
                </div>
              </div>
            )}
          </label>

          <button
            type="submit"
            disabled={!file || loading}
            className="mt-4 w-full bg-neutral-900 text-white rounded-lg py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition"
          >
            {loading ? "Extracting… (30–60s)" : "Extract"}
          </button>
        </form>

        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 text-red-900 rounded-lg p-4 text-sm">
            <div className="font-medium mb-1">Ingestion failed</div>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xl font-semibold">{result.schema.title}</h2>
                <span className="text-xs text-neutral-500">
                  {result.schema.documentType} · {(result.elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="flex items-center justify-between mb-6">
                <div className="text-sm text-neutral-500">
                  id: <code className="font-mono">{result.shortId}</code>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/a/${result.shortId}`}
                    className="inline-flex items-center text-sm font-medium text-neutral-900 border border-neutral-300 rounded-md px-3 py-1.5 hover:bg-neutral-100 transition"
                  >
                    Open form →
                  </a>
                  <a
                    href={`/a/${result.shortId}/compare`}
                    className="inline-flex items-center text-sm text-neutral-600 border border-neutral-200 rounded-md px-3 py-1.5 hover:bg-neutral-100 transition"
                  >
                    Compare (dev)
                  </a>
                </div>
              </div>

              <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mb-3">
                Fields ({result.schema.fields.length})
              </h3>
              <div className="space-y-2">
                {result.schema.fields.map((f) => {
                  const isLow = lowConfidenceSet.has(f.id) || f.confidence < 0.7;
                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between border border-neutral-200 rounded-md px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isLow
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {(f.confidence * 100).toFixed(0)}%
                        </span>
                        <span className="font-medium truncate">{f.label}</span>
                        {f.required && (
                          <span className="text-xs text-red-600">required</span>
                        )}
                      </div>
                      <span className="text-xs text-neutral-500 font-mono">{f.type}</span>
                    </div>
                  );
                })}
              </div>

              {result.schema.signatureBlocks.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-wide mt-6 mb-3">
                    Signature blocks ({result.schema.signatureBlocks.length})
                  </h3>
                  <ul className="text-sm space-y-1">
                    {result.schema.signatureBlocks.map((b) => (
                      <li key={b.id} className="flex items-center gap-3">
                        <span className="text-neutral-400 font-mono text-xs">
                          #{b.order}
                        </span>
                        <span>{b.role}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <details className="bg-white border border-neutral-200 rounded-lg p-6">
              <summary className="cursor-pointer text-sm font-medium text-neutral-700">
                Style fingerprint (raw JSON)
              </summary>
              <pre className="mt-4 text-xs overflow-x-auto bg-neutral-50 rounded p-3 border border-neutral-200">
{JSON.stringify(result.styleFingerprint, null, 2)}
              </pre>
            </details>

            <details className="bg-white border border-neutral-200 rounded-lg p-6">
              <summary className="cursor-pointer text-sm font-medium text-neutral-700">
                Full schema (raw JSON)
              </summary>
              <pre className="mt-4 text-xs overflow-x-auto bg-neutral-50 rounded p-3 border border-neutral-200">
{JSON.stringify(result.schema, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
