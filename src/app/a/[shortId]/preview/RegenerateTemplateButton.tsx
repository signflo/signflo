"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  agreementId: string;
  compact?: boolean;
}

/**
 * Phase D.1 — POSTs to /api/agreements/{id}/regenerate-template and reloads
 * the preview page on success. Shown when template_html is NULL (failure
 * recovery) and as a small "regenerate" affordance in the preview chrome.
 */
export function RegenerateTemplateButton({ agreementId, compact = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agreements/${agreementId}/regenerate-template`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok !== true) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : `Regeneration failed (${res.status})`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        className="text-sm rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50"
      >
        {busy ? "Regenerating…" : "Regenerate template"}
      </button>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        className="rounded-md bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {busy ? "Regenerating template…" : "Retry template generation"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
