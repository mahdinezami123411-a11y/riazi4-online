-- Multi-book, lesson-scoped question bank, assignments, and course access.
-- This migration mirrors the schema update applied to the connected Supabase project.

alter table public.yare_question_bank
  add column if not exists subject text not null default 'math',
  add column if not exists lesson_id smallint not null default 1;

update public.yare_question_bank
set lesson_id = chapter_id
where subject = 'math' and lesson_id = 1;

alter table public.yare_question_bank
  drop constraint if exists yare_question_bank_subject_check;
alter table public.yare_question_bank
  add constraint yare_question_bank_subject_check
  check (subject = any (array['math','persian','dictation','science','social','gifts']::text[]));

alter table public.yare_question_bank
  drop constraint if exists yare_question_bank_lesson_id_check;
alter table public.yare_question_bank
  add constraint yare_question_bank_lesson_id_check
  check (lesson_id >= 1 and lesson_id <= 100);

create index if not exists yare_question_bank_class_subject_lesson_idx
  on public.yare_question_bank(class_id, subject, lesson_id, is_active);

alter table public.yare_assignments
  add column if not exists subject text not null default 'math',
  add column if not exists lesson_ids smallint[] not null default array[1]::smallint[];

update public.yare_assignments
set lesson_ids = chapter_ids
where subject = 'math' and (lesson_ids is null or lesson_ids = array[1]::smallint[]);

alter table public.yare_assignments
  drop constraint if exists yare_assignments_subject_check;
alter table public.yare_assignments
  add constraint yare_assignments_subject_check
  check (subject = any (array['math','persian','dictation','science','social','gifts']::text[]));

alter table public.yare_assignments
  drop constraint if exists yare_assignments_lesson_ids_check;
alter table public.yare_assignments
  add constraint yare_assignments_lesson_ids_check
  check (cardinality(lesson_ids) >= 1 and cardinality(lesson_ids) <= 100);

create index if not exists yare_assignments_class_subject_idx
  on public.yare_assignments(class_id, subject, is_published, created_at desc);

create table if not exists public.yare_course_settings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.yare_classes(id) on delete cascade,
  subject text not null check (subject = any (array['math','persian','dictation','science','social','gifts']::text[])),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id, subject)
);

alter table public.yare_course_settings enable row level security;
revoke all on public.yare_course_settings from anon, authenticated;
grant select, insert, update, delete on public.yare_course_settings to service_role;
revoke insert, update, delete on public.yare_question_bank from anon, authenticated;
revoke insert, update, delete on public.yare_assignments from anon, authenticated;

comment on table public.yare_course_settings is
  'Per-class settings for each subject, including lesson access schedule and shared textbook storage path.';
comment on column public.yare_question_bank.subject is
  'Course identifier: math, persian, dictation, science, social, or gifts.';
comment on column public.yare_question_bank.lesson_id is
  'Lesson number within the subject (for Math this mirrors the chapter number).';
comment on column public.yare_assignments.lesson_ids is
  'List of lesson numbers this activity may draw questions from.';
