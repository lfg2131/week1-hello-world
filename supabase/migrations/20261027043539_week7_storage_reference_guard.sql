-- Forward-only follow-up to Week 7, canonical in the main repository.
-- Registered files are managed by the admin's reference-checked deletion flow.
-- The old owner-delete policy considered captions but not generation requests.
create function private.caption_lab_is_unregistered_upload(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and split_part(p_path, '/', 1) = auth.uid()::text
    and not exists (
      select 1 from public.caption_lab_images i where i.storage_path = p_path
    );
$$;
revoke all on function private.caption_lab_is_unregistered_upload(text) from public, anon;
grant execute on function private.caption_lab_is_unregistered_upload(text) to authenticated;

-- Restrictive: cannot be bypassed by another permissive Storage delete policy.
-- Other buckets retain their existing access rules; no rows/files are changed.
create policy week7_media_delete_unregistered_only
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'week4-media'
  or private.caption_lab_is_unregistered_upload(name)
);
