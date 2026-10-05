"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_CONTEXT_LENGTH, MEDIA_BUCKET, validateImageFile, type Tone } from "@/lib/captions/validation";
import { createCaptions, prepareUpload, type GenerateResult } from "./actions";

type Phase = "idle" | "uploading" | "generating";
type Success = Extract<GenerateResult, { status: "ok" }>;

const TONE_LABELS: Record<Tone | "", { label: string; hint: string }> = {
  "": { label: "Surprise me", hint: "One of each" },
  clever: { label: "Clever", hint: "Wordplay, sharp takes" },
  dry: { label: "Dry", hint: "Deadpan, straight face" },
  chaotic: { label: "Chaotic", hint: "Unhinged group-chat energy" },
};

export function CreateStudio({ vibe }: { vibe: { title: string; hint: string } }) {
  const router = useRouter();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState<Tone | "">("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Success | null>(null);
  const busy = phase !== "idle";

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  function choose(next: File | undefined) {
    setError("");
    if (!next) return;
    const invalid = validateImageFile(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  function reset() {
    setFile(null);
    setPreview("");
    setContext("");
    setTone("");
    setResult(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) {
      if (!file) setError("Choose a photo first.");
      return;
    }
    setError("");
    setPhase("uploading");
    try {
      const prepared = await prepareUpload({ type: file.type, size: file.size, name: file.name });
      if (prepared.status !== "ok") throw new Error(prepared.message);
      // Bytes go straight to private Storage under the server-chosen path; the
      // bucket and its RLS policy enforce owner folder, type, and size limits.
      const { error: uploadError } = await createClient().storage.from(MEDIA_BUCKET)
        .upload(prepared.path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (uploadError) throw new Error("Your photo didn’t upload. Check your connection and try again.");

      setPhase("generating");
      const generated = await createCaptions({ path: prepared.path, context, tone: tone || null });
      if (generated.status !== "ok") throw new Error(generated.message);
      setResult(generated);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Something went wrong. Try again.");
    } finally {
      setPhase("idle");
    }
  }

  if (result) {
    return (
      <section aria-labelledby="result-title" className="space-y-6">
        <header className="space-y-2">
          <p className="eyebrow">Posted to the feed</p>
          <h1 id="result-title" ref={resultHeading} tabIndex={-1} className="text-3xl font-bold tracking-tight sm:text-4xl">Three takes. Campus decides.</h1>
          <p className="text-muted">All three captions are saved and in the rating feed now.</p>
        </header>
        <ol className="grid gap-4 md:grid-cols-3">
          {result.captions.map((caption, index) => (
            <li key={caption.id} className="card card-enter" style={{ animationDelay: `${index * 80}ms` }}>
              <div className="relative aspect-[4/5] bg-zinc-900">
                {result.imageUrl && <Image src={result.imageUrl} alt={result.imageAlt} fill unoptimized sizes="(min-width: 768px) 320px, 100vw" className="object-cover" />}
                <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Take {index + 1}</span>
              </div>
              <p className="p-5 text-lg leading-snug font-semibold text-pretty">{caption.caption}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/rate" className="btn-funny">Go rate the feed</Link>
          <button type="button" className="btn-quiet" onClick={reset}>Make another</button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={generate} className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start" aria-busy={busy}>
      <header className="space-y-2 lg:col-span-2">
        <p className="eyebrow">Create</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Make something worth rating</h1>
        <p className="text-muted">Drop a photo. The AI writes three different captions, then everyone votes.</p>
      </header>

      <div>
        <label
          htmlFor={inputId}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) choose(event.dataTransfer.files[0]); }}
          className={`card relative flex aspect-[4/5] max-h-[60vh] w-full cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-funny ${dragging ? "border-funny bg-lime-300/5" : "border-line hover:border-zinc-500"} ${preview ? "border-solid p-0" : ""}`}
        >
          {preview ? (
            <>
              <Image src={preview} alt="Preview of the photo you chose." fill unoptimized sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
              {!busy && <span className="absolute right-3 bottom-3 rounded-full bg-black/75 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">Change photo</span>}
              {busy && (
                <span className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
                  <span className="flex flex-col items-center gap-3 text-white">
                    <span aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-white/25 border-t-funny" />
                    <span className="text-lg font-semibold">{phase === "uploading" ? "Uploading photo…" : "Writing 3 captions…"}</span>
                  </span>
                </span>
              )}
            </>
          ) : (
            <>
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-surface-raised text-2xl">📸</span>
              <span className="text-lg font-semibold">Add a photo</span>
              <span className="text-sm text-muted">Tap to choose or drag it here. JPEG, PNG, or WebP up to 5 MB.</span>
            </>
          )}
          <input
            ref={fileInput}
            id={inputId}
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            aria-describedby={`${inputId}-help`}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
        <p id={`${inputId}-help`} className="sr-only">Photo for captioning. JPEG, PNG, or WebP up to 5 megabytes.</p>
      </div>

      <div className="space-y-7">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${inputId}-context`} className="font-semibold">What should the AI know? <span className="font-normal text-muted">(optional)</span></label>
            <span className="text-xs text-muted" aria-live="polite">{context.length}/{MAX_CONTEXT_LENGTH}</span>
          </div>
          <textarea
            id={`${inputId}-context`}
            className="field min-h-24 resize-y"
            maxLength={MAX_CONTEXT_LENGTH}
            placeholder="First time trying dollar pizza at 2am"
            value={context}
            disabled={busy}
            onChange={(event) => setContext(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <span className="text-muted">Today’s vibe:</span>
            <span className="font-semibold">{vibe.title}</span>
            <button type="button" className="btn-ghost ml-auto min-h-9 text-brand-soft" disabled={busy} onClick={() => setContext(vibe.hint)}>
              Use it
            </button>
          </div>
        </div>

        <fieldset className="space-y-3" disabled={busy}>
          <legend className="mb-3 font-semibold">Tone</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TONE_LABELS) as (Tone | "")[]).map((value) => (
              <label key={value || "surprise"} className="relative block">
                <input
                  className="tone-input peer sr-only"
                  type="radio"
                  name="tone"
                  value={value}
                  checked={tone === value}
                  onChange={() => setTone(value)}
                />
                <span className="chip w-full flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left">
                  <span className="font-semibold text-foreground">{TONE_LABELS[value].label}</span>
                  <span className="text-xs">{TONE_LABELS[value].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-3">
          <button type="submit" className="btn-brand w-full text-lg" disabled={busy}>
            {phase === "uploading" ? "Uploading…" : phase === "generating" ? "Writing captions…" : "Generate 3 captions"}
          </button>
          <div aria-live="assertive">
            {error && <p role="alert" className="alert-error">{error}</p>}
          </div>
        </div>
      </div>
    </form>
  );
}
