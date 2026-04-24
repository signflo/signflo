"use client";

import { useEffect, useRef, useState } from "react";

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
  pageCount?: number;
  elapsedMs: number;
}

export default function IngestPage() {
  const [pages, setPages] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build/refresh object-URL thumbnails when the page list changes. Revoke
  // old URLs on cleanup to avoid leaking memory in a long-lived dev session.
  useEffect(() => {
    const urls = pages.map((p) =>
      p.type === "application/pdf" ? "" : URL.createObjectURL(p),
    );
    setThumbs(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [pages]);

  function addFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    const fresh = Array.from(incoming);
    // Disallow mixing PDFs with anything else — PDFs are inherently multi-page.
    const allFiles = [...pages, ...fresh];
    const hasPdf = allFiles.some((f) => f.type === "application/pdf");
    if (hasPdf && allFiles.length > 1) {
      setError("PDFs are inherently multi-page — please upload a single PDF, not a PDF combined with other files.");
      return;
    }
    setError(null);
    setPages(allFiles);
  }

  function removePage(idx: number) {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  }

  function movePage(idx: number, direction: -1 | 1) {
    setPages((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (pages.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      for (const p of pages) {
        fd.append("files", p);
      }
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
  const totalKb = pages.reduce((s, p) => s + p.size, 0) / 1024;

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
          <PageDropzone hasPages={pages.length > 0} onAdd={addFiles} />

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ChooseFilesButton onAdd={addFiles} />
            <TakePhotoButton onAdd={addFiles} />
            {pages.length > 0 && (
              <button
                type="button"
                onClick={() => setPages([])}
                className="text-sm text-neutral-600 border border-neutral-300 rounded-md px-3 py-2 hover:bg-neutral-100"
              >
                Clear all
              </button>
            )}
          </div>

          {pages.length > 0 && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-medium text-neutral-700">
                  {pages.length === 1 ? "1 page" : `${pages.length} pages`}
                  {" · "}
                  <span className="text-neutral-500 font-normal">{totalKb.toFixed(1)} KB total</span>
                </div>
              </div>
              <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {pages.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="relative border border-neutral-200 rounded-md overflow-hidden bg-white"
                  >
                    <div className="aspect-[3/4] bg-neutral-100 flex items-center justify-center">
                      {p.type === "application/pdf" ? (
                        <div className="text-center text-xs text-neutral-500 px-2">
                          <div className="text-2xl mb-1">PDF</div>
                          <div className="truncate max-w-full">{p.name}</div>
                        </div>
                      ) : thumbs[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbs[i]}
                          alt={`Page ${i + 1}`}
                          className="object-cover w-full h-full"
                        />
                      ) : null}
                    </div>
                    <div className="px-2 py-1.5 text-xs flex items-center justify-between gap-2 border-t border-neutral-100">
                      <span className="font-medium">#{i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePage(i, -1)}
                          disabled={i === 0}
                          className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move page ${i + 1} up`}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => movePage(i, 1)}
                          disabled={i === pages.length - 1}
                          className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move page ${i + 1} down`}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removePage(i)}
                          className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-red-700 hover:bg-red-50 rounded"
                          aria-label={`Remove page ${i + 1}`}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <button
            type="submit"
            disabled={pages.length === 0 || loading}
            className="mt-5 w-full bg-neutral-900 text-white rounded-lg py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition"
          >
            {loading
              ? `Extracting${pages.length > 1 ? ` ${pages.length} pages` : ""}… (30–90s)`
              : `Extract${pages.length > 1 ? ` ${pages.length} pages` : ""}`}
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

function PageDropzone({
  hasPages,
  onAdd,
}: {
  hasPages: boolean;
  onAdd: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label
      htmlFor="ingest-multi-input"
      className="block border-2 border-dashed border-neutral-300 rounded-lg p-8 sm:p-10 text-center cursor-pointer hover:bg-neutral-100 transition"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onAdd(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id="ingest-multi-input"
        type="file"
        accept="image/*,application/pdf,.pdf,.heic,.heif"
        multiple
        onChange={(e) => {
          onAdd(e.target.files);
          // Reset so the same file can be re-added if needed.
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
      <div>
        <div className="font-medium">
          {hasPages ? "Drop more pages here" : "Drop images or a PDF here"}
        </div>
        <div className="text-sm text-neutral-500 mt-1">
          Multi-page docs: drop or pick all pages at once. PDFs: single file (already multi-page).
        </div>
      </div>
    </label>
  );
}

function ChooseFilesButton({ onAdd }: { onAdd: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-sm font-medium text-neutral-900 border border-neutral-300 rounded-md px-3 py-2 hover:bg-neutral-100"
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.heic,.heif"
        multiple
        onChange={(e) => {
          onAdd(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
    </>
  );
}

function TakePhotoButton({ onAdd }: { onAdd: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-sm font-medium text-neutral-900 border border-neutral-300 rounded-md px-3 py-2 hover:bg-neutral-100 inline-flex items-center justify-center gap-1.5"
      >
        <span aria-hidden>📷</span>
        Take photo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          onAdd(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
    </>
  );
}
