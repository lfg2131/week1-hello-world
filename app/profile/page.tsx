import { requireProfile } from "@/lib/supabase/profile";
import { AccountShell, ProfileUnavailable } from "@/app/components/account-shell";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const { profile, email } = await requireProfile();
  if (!profile) return <ProfileUnavailable />;
  return <AccountShell tone="profile">
    <p className="status-profile">Your account · /profile</p>
    <h1 className="text-3xl font-bold text-violet-100">Profile</h1>
    <p className="text-zinc-300">Update your name and photo. Your changes will be here when you return.</p>
    <ProfileForm profile={profile} email={email} />
  </AccountShell>;
}
