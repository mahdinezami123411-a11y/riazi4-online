-- BE-04: non-math activity answers are generated and scored in the browser.
-- Keep them useful for practice reporting, but label their trust level explicitly
-- so they can never be confused with server-scored math/assignment attempts.
alter table public.yare_subject_practice_progress
  add column if not exists scoring_source text not null default 'self_reported';

alter table public.yare_subject_practice_progress
  drop constraint if exists yare_subject_practice_progress_scoring_source_check;

alter table public.yare_subject_practice_progress
  add constraint yare_subject_practice_progress_scoring_source_check
  check (scoring_source in ('self_reported', 'server'));

create or replace function public.yare_force_subject_progress_self_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Direct REST writes by students are always self-reported. Only a trusted
  -- service-role process may write the reserved server value.
  if auth.role() <> 'service_role' then
    new.scoring_source := 'self_reported';
  end if;
  return new;
end;
$$;

drop trigger if exists yare_subject_progress_force_self_reported
  on public.yare_subject_practice_progress;

create trigger yare_subject_progress_force_self_reported
  before insert or update on public.yare_subject_practice_progress
  for each row execute function public.yare_force_subject_progress_self_reported();

comment on column public.yare_subject_practice_progress.scoring_source is
  'self_reported for browser-generated non-math practice; server only for trusted server scoring.';
