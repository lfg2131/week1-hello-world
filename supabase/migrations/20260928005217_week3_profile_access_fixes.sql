-- Documentation of profile access fixes already applied to the shared database
-- after commit 60ac9b9c34a872bff7e977acb0d2128f47e9f5d6.
-- Repeatable against the existing profiles table and named policy; no recreation.
-- Preserve moderation visibility for other profiles while allowing own-row reads.
alter policy "beta1_profiles_visibility"
on public.profiles
using (
  (select auth.uid()) = id
  or private.moderation_profile_visible_current(id)
);

-- Table privileges are required in addition to the existing RLS policies.
grant select, update on table public.profiles to authenticated;
