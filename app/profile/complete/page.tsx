import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/profile";
import { isProfileComplete } from "@/lib/profile";
import { AccountShell, ProfileUnavailable } from "@/app/components/account-shell";
import ProfileForm from "../profile-form";

export default async function CompleteProfilePage() {
  const { profile, email } = await requireProfile();
  if (!profile) return <ProfileUnavailable />;
  if (isProfileComplete(profile)) redirect("/protected");
  return <AccountShell tone="setup">
    <p className="status-warning">Setup required · Final step</p>
    <h1 className="text-3xl font-bold text-amber-100">Let’s make it personal</h1>
    <p className="text-zinc-300">Add your first and last name to finish setting up your profile and visit the protected page.</p>
    <ProfileForm profile={profile} email={email} completing />
  </AccountShell>;
}
