import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/profile";
import { isProfileComplete } from "@/lib/profile";
import { AccountShell, ProfileUnavailable } from "@/app/components/account-shell";

export default async function ProtectedPage() {
  const { profile, email } = await requireProfile();
  if (!profile) return <ProfileUnavailable />;
  if (!isProfileComplete(profile)) redirect("/profile/complete");
  return <AccountShell tone="success">
    <p className="status-success">Authenticated · /protected</p>
    <h1 className="text-3xl font-bold text-emerald-100">Protected Page</h1>
    <h2 className="text-xl">Welcome, {profile.first_name}</h2>
    <p className="break-words">Signed in as: <span className="font-semibold">{email || "Authenticated user"}</span></p>
    <p className="text-zinc-300">This content is only visible to authenticated users.</p>
    <Link href="/profile" className="primary-button inline-block">Edit your profile</Link>
  </AccountShell>;
}
