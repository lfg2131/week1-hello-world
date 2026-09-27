-- Documentation of the already-applied Week 3 addition to the shared database.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;
