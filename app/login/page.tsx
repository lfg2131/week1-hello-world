import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import GoogleSignIn from "./google-sign-in";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId, safeReturnPath } from "@/lib/auth";
import { BrandMark } from "@/app/components/brand";
import hero from "@/public/login-hero.jpg";

export const metadata: Metadata = { title: "Sign in" };

const steps = [
  ["Drop a photo", "Your 2am slice, the subway pigeon, your dorm at its worst."],
  ["Get 3 AI captions", "Joke as a student or a professor, pick a vibe, and get three different takes."],
  ["Campus votes", "Rate everyone else’s. Funny or not funny. One tap."],
] as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeReturnPath((await searchParams).next);
  if (await getVerifiedUserId(await createClient())) redirect(next);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-12">
      <figure className="relative -mx-4 overflow-hidden sm:mx-0 sm:mt-6 sm:rounded-3xl lg:order-2 lg:mt-0">
        <Image
          src={hero}
          alt="A hand holds up a phone to film glowing city lights at night, the crowd around it in silhouette."
          preload
          placeholder="blur"
          sizes="(min-width: 1024px) 520px, 100vw"
          className="h-[46vh] min-h-72 w-full object-cover sm:h-[52vh] lg:h-[640px]"
        />
        <div className="hero-scrim absolute inset-0" aria-hidden="true" />
        <figcaption className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
          <p className="mb-2 inline-flex rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-zinc-200 backdrop-blur">Example card</p>
          <p className="max-w-md text-xl font-semibold leading-snug text-white sm:text-2xl">
            “Moved to New York for the culture. Have experienced it exclusively through a phone screen.”
          </p>
          <p className="mt-3 text-xs text-zinc-400">
            Photo: Yosuke Ota on Unsplash
          </p>
        </figcaption>
      </figure>

      <section className="space-y-8 lg:order-1" aria-labelledby="login-title">
        <BrandMark />
        <div className="space-y-4">
          <h1 id="login-title" className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Your camera roll is funnier than you think.
          </h1>
          <p className="max-w-md text-lg text-muted">
            Drop a photo, get three AI captions, and let campus vote on which one actually lands.
          </p>
        </div>

        <div className="max-w-sm space-y-3">
          <GoogleSignIn next={next} />
          <p className="text-sm text-muted">Sign in to vote and create. We use your Google account just to sign you in.</p>
          <Link href="/explore" className="inline-block rounded-lg text-sm font-semibold text-brand-soft underline-offset-4 hover:text-white hover:underline">
            Just browsing? See the captions on Explore →
          </Link>
        </div>

        <ol className="grid max-w-xl gap-3 sm:grid-cols-3">
          {steps.map(([title, body], index) => (
            <li key={title} className="rounded-2xl border border-line bg-surface p-4">
              <p className="font-mono text-xs text-brand-soft">0{index + 1}</p>
              <p className="mt-1 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
