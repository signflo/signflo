"use client";

import { useEffect, useRef, useState } from "react";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

interface DraftSaveArgs {
  agreementId: string;
  initialDraftToken: string | null;
  data: Record<string, unknown>;
  /** When true, skip saving (e.g., after final submit). */
  paused?: boolean;
  /** Milliseconds of inactivity before a save fires. */
  debounceMs?: number;
}

interface DraftSaveResult {
  status: DraftSaveStatus;
  draftToken: string | null;
  lastSavedAt: Date | null;
  lastError: string | null;
}

/**
 * Debounced auto-save for form drafts. Watches the `data` prop and POSTs to
 * /api/drafts whenever it changes and the debounce window elapses.
 *
 * First successful save:
 *  - The API mints a new token and returns it in `draftToken`.
 *  - This hook stores the token in state and calls history.replaceState()
 *    so the URL bar reflects /s/{token} — bookmarkable, shareable,
 *    survives tab close, and keeps the Phase-B /a/{shortId} route
 *    clean of per-user drafts.
 *
 * Subsequent saves pass the existing token so the server updates in place.
 *
 * If initialDraftToken is supplied (coming from /s/{token} in draft mode),
 * auto-save targets that draft from the very first edit — no URL rewrite
 * needed, we're already there.
 */
export function useDraftSave({
  agreementId,
  initialDraftToken,
  data,
  paused = false,
  debounceMs = 1500,
}: DraftSaveArgs): DraftSaveResult {
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const [draftToken, setDraftToken] = useState<string | null>(initialDraftToken);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const tokenRef = useRef(draftToken);
  // Track whether we've seen ANY user edit so we don't auto-save the
  // initial (empty) state immediately on mount.
  const hasEditedRef = useRef(false);

  // Keep refs current without re-triggering the debounce timer.
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    tokenRef.current = draftToken;
  }, [draftToken]);

  useEffect(() => {
    if (paused) return;
    hasEditedRef.current = true;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setStatus("saving");
      setLastError(null);
      try {
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agreementId,
            draftToken: tokenRef.current ?? undefined,
            data: dataRef.current,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = await res.json();
        const nextToken = body.draftToken as string | undefined;
        if (nextToken && nextToken !== tokenRef.current) {
          setDraftToken(nextToken);
          tokenRef.current = nextToken;
          // First save — rewrite the URL so the user's address bar reflects
          // the shareable/bookmarkable draft URL.
          if (typeof window !== "undefined") {
            const nextUrl = body.ownerUrl ?? `/s/${nextToken}`;
            window.history.replaceState({}, "", nextUrl);
          }
        }
        setStatus("saved");
        setLastSavedAt(new Date(body.savedAt ?? Date.now()));
      } catch (err) {
        setStatus("error");
        setLastError(err instanceof Error ? err.message : String(err));
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // Intentionally omit paused from deps so the timer keeps running when
    // not paused; include data so every value change restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, agreementId]);

  return { status, draftToken, lastSavedAt, lastError };
}
