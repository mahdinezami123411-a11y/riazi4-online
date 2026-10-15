-- The table is RLS-protected. Remove broad default grants, then give the signed-in app only what its student/teacher policies allow.
revoke all privileges on table public.yare_subject_practice_progress from public, anon, authenticated;
grant select, insert, update on table public.yare_subject_practice_progress to authenticated;
