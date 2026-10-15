-- Durable, per-student progress for non-math subjects and Persian lesson activities.
-- RLS limits writes to the authenticated student's own profile/class and allows
-- their class teacher to read progress for reporting.
create table public.yare_subject_practice_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.yare_profiles(id) on delete cascade,
  class_id uuid null references public.yare_classes(id) on delete set null,
  subject text not null check (subject in ('science','persian','social','gifts','dictation')),
  lesson_id integer not null check (lesson_id between 1 and 100),
  activity_key text not null check (length(activity_key) between 1 and 80),
  activity_type text not null default 'practice' check (length(activity_type) <= 80),
  selected_answer smallint null check (selected_answer between 0 and 100),
  correct_answer smallint null check (correct_answer between 0 and 100),
  is_correct boolean not null default false,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  question_text text not null default '',
  explanation text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint yare_subject_practice_progress_student_activity_unique
    unique (student_id, subject, lesson_id, activity_key)
);

create index yare_subject_practice_progress_student_updated_idx
  on public.yare_subject_practice_progress (student_id, updated_at desc);
create index yare_subject_practice_progress_class_subject_idx
  on public.yare_subject_practice_progress (class_id, subject, updated_at desc);

alter table public.yare_subject_practice_progress enable row level security;

drop policy if exists yare_subject_progress_select_self_or_teacher
  on public.yare_subject_practice_progress;
create policy yare_subject_progress_select_self_or_teacher
  on public.yare_subject_practice_progress
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or public.yare_teacher_can_access_class(class_id)
  );

drop policy if exists yare_subject_progress_insert_self
  on public.yare_subject_practice_progress;
create policy yare_subject_progress_insert_self
  on public.yare_subject_practice_progress
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and class_id is not distinct from (
      select p.class_id from public.yare_profiles p
      where p.id = (select auth.uid())
    )
  );

drop policy if exists yare_subject_progress_update_self
  on public.yare_subject_practice_progress;
create policy yare_subject_progress_update_self
  on public.yare_subject_practice_progress
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (
    student_id = (select auth.uid())
    and class_id is not distinct from (
      select p.class_id from public.yare_profiles p
      where p.id = (select auth.uid())
    )
  );

grant select, insert, update on public.yare_subject_practice_progress to authenticated;
