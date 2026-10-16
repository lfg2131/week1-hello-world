"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, type Perspective, type Tone } from "@/lib/captions/validation";
import { prepareUpload, type GenerateResult } from "./create/actions";

// One caption generation at a time, owned by the (lab) layout. The layout stays
// mounted while the user moves between Create, Explore, and Rate, so the
// in-flight request (a plain fetch to a Route Handler, not a queued Server
// Action) keeps running and its result is still delivered. A full page
// refresh does reset this state; we warn before unloading instead of pretending.

export type Success = Extract<GenerateResult, { status: "ok" }>;
export type GenerationJob =
  | { status: "uploading" | "generating"; perspective: Perspective }
  | { status: "success"; result: Success }
  | { status: "error"; message: string }
  | null;

export type GenerationInput = { file: File; context: string; tone: Tone | null; perspective: Perspective };

type GenerationContext = {
  job: GenerationJob;
  busy: boolean;
  /** Returns false (and does nothing) while another generation is running. */
  start: (input: GenerationInput) => boolean;
  dismiss: () => void;
};

const Context = createContext<GenerationContext | null>(null);

export function useGeneration() {
  const value = useContext(Context);
  if (!value) throw new Error("useGeneration must be used inside GenerationProvider");
  return value;
}

async function requestCaptions(body: { path: string; context: string; tone: Tone | null; perspective: Perspective }): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch("/api/captions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { status: "error", message: "We lost the connection while writing your captions. Check Explore in a moment, then try again." };
  }
  try {
    return (await response.json()) as GenerateResult;
  } catch {
    return { status: "error", message: response.status === 504 ? "The AI took too long. Try again." : "Caption generation failed. Try again." };
  }
}

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [job, setJob] = useState<GenerationJob>(null);
  // A ref, not state, so two fast clicks can never start two requests.
  const running = useRef(false);
  const busy = job?.status === "uploading" || job?.status === "generating";

  useEffect(() => {
    if (!busy) return;
    // A reload would drop the result in this tab, so ask first.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const start = useCallback((input: GenerationInput) => {
    if (running.current) return false;
    running.current = true;
    setJob({ status: "uploading", perspective: input.perspective });
    (async () => {
      try {
        const prepared = await prepareUpload({ type: input.file.type, size: input.file.size, name: input.file.name });
        if (prepared.status !== "ok") throw new Error(prepared.message);
        // Bytes go straight to private Storage under the server-chosen path; the
        // bucket and its RLS policy enforce owner folder, type, and size limits.
        const { error: uploadError } = await createClient().storage.from(MEDIA_BUCKET)
          .upload(prepared.path, input.file, { contentType: input.file.type, upsert: false, cacheControl: "3600" });
        if (uploadError) throw new Error("Your photo didn’t upload. Check your connection and try again.");

        setJob({ status: "generating", perspective: input.perspective });
        const result = await requestCaptions({ path: prepared.path, context: input.context, tone: input.tone, perspective: input.perspective });
        if (result.status !== "ok") throw new Error(result.message);
        setJob({ status: "success", result });
        router.refresh();
      } catch (caught) {
        setJob({ status: "error", message: caught instanceof Error && caught.message ? caught.message : "Something went wrong. Try again." });
      } finally {
        running.current = false;
      }
    })();
    return true;
  }, [router]);

  const dismiss = useCallback(() => {
    if (!running.current) setJob(null);
  }, []);

  return (
    <Context.Provider value={{ job, busy, start, dismiss }}>
      {children}
      <GenerationToast job={job} onDismiss={dismiss} />
    </Context.Provider>
  );
}

export function GenerationToast({ job, onDismiss }: { job: GenerationJob; onDismiss: () => void }) {
  return (
    // Always mounted so screen readers hear each status change.
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end sm:inset-x-auto sm:right-6 sm:bottom-6">
      {job && (
        <div className="toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface-raised/95 p-4 shadow-2xl shadow-black/50 backdrop-blur sm:w-80">
          {job.status === "uploading" || job.status === "generating" ? (
            <>
              <span aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-funny" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Generating your captions…</p>
                <p className="mt-0.5 text-sm text-muted">
                  {job.status === "uploading" ? "Uploading your photo." : `Writing 3 ${job.perspective} takes.`} Keep browsing; we’ll tell you here.
                </p>
              </div>
            </>
          ) : job.status === "success" ? (
            <>
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-funny text-sm font-black text-zinc-950">✓</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Your captions are ready!</p>
                <Link
                  href={`/explore?batch=${job.result.batchId}#caption-${job.result.captions[0]?.id ?? ""}`}
                  onClick={onDismiss}
                  className="mt-1 inline-block text-sm font-semibold text-brand-soft underline-offset-4 hover:text-white hover:underline"
                >
                  View your captions →
                </Link>
              </div>
              <button type="button" className="btn-ghost -m-2 min-h-9 px-2 text-muted" onClick={onDismiss} aria-label="Dismiss">✕</button>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-red-400 text-sm font-black text-zinc-950">!</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Couldn’t make your captions</p>
                <p className="mt-0.5 text-sm text-red-100">{"message" in job ? job.message : ""}</p>
                <Link href="/create" onClick={onDismiss} className="mt-1 inline-block text-sm font-semibold text-brand-soft underline-offset-4 hover:text-white hover:underline">
                  Try again
                </Link>
              </div>
              <button type="button" className="btn-ghost -m-2 min-h-9 px-2 text-muted" onClick={onDismiss} aria-label="Dismiss">✕</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
