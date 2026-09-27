"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_TYPES, parseNames, validateAvatar, type Profile } from "@/lib/profile";
import { completeProfile, saveProfile, type SaveState } from "./actions";

export default function ProfileForm({ profile, email, completing = false }: { profile: Profile; email: string; completing?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(profile.first_name || "");
  const [lastName, setLastName] = useState(profile.last_name || "");
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [state, submit, pending] = useActionState(async (_previous: SaveState, form: FormData): Promise<SaveState> => {
    if (!parseNames(form.get("first_name"), form.get("last_name"))) return { error: "Enter both names, using 1–80 characters each." };
    const photo = form.get("photo");
    form.delete("photo"); // Image bytes go directly to Storage, never the profile action.
    if (photo instanceof File && photo.size > 0) {
      const invalid = validateAvatar(photo);
      if (invalid) return { error: invalid };
      setUploading(true);
      try {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.getClaims();
        if (authError || !data?.claims?.sub) return { error: "Your session has expired. Please sign in again." };
        const userId = data.claims.sub;
        const extension = AVATAR_TYPES[photo.type as keyof typeof AVATAR_TYPES];
        const path = `${userId}/profile/avatar-${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from("media").upload(path, photo, { contentType: photo.type, upsert: false });
        if (error) return { error: "Photo upload failed. Please try again with a JPEG, PNG, or WebP image up to 5 MB." };
        form.set("avatar_path", path);
      } catch {
        return { error: "Photo upload failed. Check your connection and try again." };
      } finally {
        setUploading(false);
      }
    }
    // Keep Next.js's onboarding redirect outside the upload error handler.
    if (completing) return completeProfile(form);
    try {
      const result = await saveProfile(form);
      if (result.success) {
        setFirstName(firstName.trim());
        setLastName(lastName.trim());
        if (result.avatarUrl) setAvatar(result.avatarUrl);
        if (fileInput.current) fileInput.current.value = "";
      }
      return result;
    } catch {
      return { error: "Your profile could not be saved. Check your connection and try again." };
    }
  }, {});

  return <form action={submit} className="space-y-5" aria-busy={pending}>
    {!completing && <>
      <div className="flex items-center gap-4">
        {avatar && /^https?:\/\//.test(avatar)
          ? <Image unoptimized src={avatar} alt="Your profile photo" width={80} height={80} className="h-20 w-20 rounded-full border-2 border-violet-400 object-cover ring-4 ring-violet-500/15" />
          : <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-violet-400 bg-violet-500/20 text-2xl text-violet-200 ring-4 ring-violet-500/15" aria-label="Default profile avatar">{parseNames(profile.first_name, profile.last_name)?.initials || "?"}</div>}
        <div><p className="font-medium">Your profile photo</p><p className="text-sm text-zinc-400">Make this space yours.</p></div>
      </div>
      <div><label htmlFor="email">Email</label><input className="profile-input text-zinc-400" id="email" type="email" value={email} readOnly /></div>
    </>}
    <div className="grid gap-5 sm:grid-cols-2">
      <div><label htmlFor="first_name">First name</label><input className="profile-input" id="first_name" name="first_name" autoComplete="given-name" maxLength={80} required value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={pending} /></div>
      <div><label htmlFor="last_name">Last name</label><input className="profile-input" id="last_name" name="last_name" autoComplete="family-name" maxLength={80} required value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={pending} /></div>
    </div>
    {!completing && <div>
      <label htmlFor="photo">Upload or change photo</label>
      <input ref={fileInput} id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} aria-describedby="photo-help photo-error" className="profile-input file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-white" onChange={(event) => {
        const file = event.target.files?.[0];
        const error = file ? validateAvatar(file) : null;
        setPhotoError(error || "");
        if (error) event.target.value = "";
      }} />
      <p id="photo-help" className="mt-2 text-sm text-zinc-400">JPEG, PNG, or WebP · Up to 5 MB. Saved photos are publicly visible.</p>
      <p id="photo-error" role="alert" className={photoError ? "status-error" : ""}>{photoError}</p>
    </div>}
    {state.error && <p role="alert" className="status-error">{state.error}</p>}
    <p role="status" className="text-sm text-emerald-300">{uploading ? "Uploading your photo…" : pending ? "Saving your profile…" : state.success}</p>
    <button className="profile-button w-full" type="submit" disabled={pending}>{pending ? "Saving…" : completing ? "Save and continue" : "Save Profile"}</button>
  </form>;
}
