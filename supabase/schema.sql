-- Baseline schema snapshot for Supabase project "Riazi 4" (wcntoueuhgsfkunannpx).
-- Generated 2026-11-11 from the live catalog. It contains schema objects only, no rows or secrets.
-- Apply to a fresh Supabase project after the auth schema exists. Vault and pgcrypto
-- are platform extensions used by the credential routines; configure the vault secret
-- yare_student_password_encryption_key separately and never commit it.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Enums
do $$ begin create type public.app_role as enum ('teacher', 'student'); exception when duplicate_object then null; end $$;
do $$ begin create type public.assignment_kind as enum ('practice', 'chapter_exam', 'midterm', 'final'); exception when duplicate_object then null; end $$;
do $$ begin create type public.assignment_status as enum ('draft', 'published', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.question_kind as enum ('mc', 'short', 'true_false', 'multi', 'written'); exception when duplicate_object then null; end $$;

-- Tables
create table public."classes" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "grade" smallint default 4 not null,
  "school_year" text default '1405-1406'::text not null,
  "teacher_id" uuid not null,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "classes_grade_check" check (grade >= 1 AND grade <= 12)
);

create table public."profiles" (
  "id" uuid not null,
  "role" app_role not null,
  "display_name" text not null,
  "class_id" uuid,
  "avatar_url" text,
  "student_code" text unique,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  primary key ("id")
);

create table public."chapters" (
  "id" smallint not null,
  "title" text not null,
  "summary" text default ''::text not null,
  "sort_order" smallint not null unique,
  primary key ("id"),
  constraint "chapters_id_check" check (id >= 1 AND id <= 7)
);

create table public."questions" (
  "id" uuid default gen_random_uuid() not null,
  "chapter_id" smallint,
  "owner_teacher_id" uuid not null,
  "kind" question_kind default 'mc'::question_kind not null,
  "prompt" text not null,
  "options" jsonb default '[]'::jsonb not null,
  "skill" text default ''::text not null,
  "difficulty" text default 'medium'::text not null,
  "term" text,
  "explanation" text default ''::text not null,
  "is_published" boolean default false not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "questions_difficulty_check" check (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])),
  constraint "questions_term_check" check ((term = ANY (ARRAY['midterm'::text, 'final'::text])) OR term IS NULL)
);

create table public."question_answer_keys" (
  "question_id" uuid not null,
  "answer" jsonb not null,
  "grading_notes" text default ''::text not null,
  "updated_at" timestamptz default now() not null,
  primary key ("question_id")
);

create table public."assignments" (
  "id" uuid default gen_random_uuid() not null,
  "teacher_id" uuid not null,
  "class_id" uuid not null,
  "title" text not null,
  "description" text default ''::text not null,
  "kind" assignment_kind default 'practice'::assignment_kind not null,
  "chapter_id" smallint,
  "status" assignment_status default 'draft'::assignment_status not null,
  "question_count" integer default 20 not null,
  "duration_minutes" integer,
  "max_attempts" integer,
  "randomize_questions" boolean default true not null,
  "randomize_options" boolean default true not null,
  "due_at" timestamptz,
  "created_at" timestamptz default now() not null,
  "published_at" timestamptz,
  primary key ("id"),
  constraint "assignments_question_count_check" check (question_count >= 1 AND question_count <= 200),
  constraint "assignments_duration_minutes_check" check (duration_minutes IS NULL OR duration_minutes >= 1 AND duration_minutes <= 300),
  constraint "assignments_max_attempts_check" check (max_attempts IS NULL OR max_attempts >= 1 AND max_attempts <= 20)
);

create table public."assignment_questions" (
  "assignment_id" uuid not null,
  "question_id" uuid not null,
  "position" integer not null,
  "points" numeric default 1 not null,
  primary key ("assignment_id", "question_id"),
  constraint "assignment_questions_position_check" check ("position" > 0),
  constraint "assignment_questions_points_check" check (points > 0::numeric)
);

create table public."submissions" (
  "id" uuid default gen_random_uuid() not null,
  "assignment_id" uuid not null,
  "student_id" uuid not null,
  "attempt_number" smallint default 1 not null,
  "status" text default 'in_progress'::text not null,
  "started_at" timestamptz default now() not null,
  "submitted_at" timestamptz,
  "score" numeric,
  "max_score" numeric,
  "teacher_feedback" text default ''::text not null,
  primary key ("id"),
  constraint "submissions_attempt_number_check" check (attempt_number > 0),
  constraint "submissions_status_check" check (status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'graded'::text]))
);

create table public."submission_answers" (
  "id" uuid default gen_random_uuid() not null,
  "submission_id" uuid not null,
  "question_id" uuid not null,
  "response" jsonb default 'null'::jsonb not null,
  "is_correct" boolean,
  "points_awarded" numeric,
  "feedback" text default ''::text not null,
  "answered_at" timestamptz default now() not null,
  primary key ("id")
);

create table public."student_progress" (
  "student_id" uuid not null,
  "chapter_id" smallint not null,
  "mastery_percent" smallint default 0 not null,
  "completed_practice" integer default 0 not null,
  "correct_answers" integer default 0 not null,
  "wrong_answers" integer default 0 not null,
  "updated_at" timestamptz default now() not null,
  primary key ("student_id", "chapter_id"),
  constraint "student_progress_mastery_percent_check" check (mastery_percent >= 0 AND mastery_percent <= 100),
  constraint "student_progress_completed_practice_check" check (completed_practice >= 0),
  constraint "student_progress_correct_answers_check" check (correct_answers >= 0),
  constraint "student_progress_wrong_answers_check" check (wrong_answers >= 0)
);

create table public."learning_events" (
  "id" bigint generated always as identity,
  "student_id" uuid not null,
  "question_id" uuid,
  "chapter_id" smallint,
  "event_type" text not null,
  "skill" text default ''::text not null,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "learning_events_event_type_check" check (event_type = ANY (ARRAY['answer_correct'::text, 'answer_wrong'::text, 'hint_used'::text, 'practice_completed'::text, 'exam_started'::text, 'exam_submitted'::text]))
);

create table public."learning_materials" (
  "id" uuid default gen_random_uuid() not null,
  "teacher_id" uuid not null,
  "chapter_id" smallint,
  "title" text not null,
  "material_type" text not null,
  "storage_path" text not null,
  "is_published" boolean default false not null,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "learning_materials_material_type_check" check (material_type = ANY (ARRAY['pdf'::text, 'video'::text, 'link'::text]))
);

create table public."yare_classes" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "teacher_id" uuid not null,
  "created_at" timestamptz default now() not null,
  primary key ("id")
);

create table public."yare_profiles" (
  "id" uuid not null,
  "role" text not null,
  "display_name" text default ''::text not null,
  "nickname" text default ''::text not null,
  "favorite_skill" text default ''::text not null,
  "class_id" uuid,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  "student_code" text,
  "avatar_path" text,
  primary key ("id"),
  constraint "yare_profiles_role_check" check (role = ANY (ARRAY['teacher'::text, 'student'::text]))
);

create table public."yare_question_bank" (
  "id" uuid default gen_random_uuid() not null,
  "class_id" uuid,
  "chapter_id" smallint not null,
  "skill" text default ''::text not null,
  "prompt" text not null,
  "question_type" text not null,
  "options" jsonb default '[]'::jsonb not null,
  "difficulty" text default 'medium'::text not null,
  "sort_order" integer default 1000 not null,
  "is_active" boolean default true not null,
  "created_by" uuid,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  "pdf_sample_set" text,
  "subject" text default 'math'::text not null,
  "lesson_id" smallint default 1 not null,
  primary key ("id"),
  constraint "yare_question_bank_chapter_id_check" check (chapter_id >= 1 AND chapter_id <= 7),
  constraint "yare_question_bank_question_type_check" check (question_type = ANY (ARRAY['mc'::text, 'input'::text, 'tf'::text, 'multi'::text, 'blank_mc'::text, 'matching'::text])),
  constraint "yare_question_bank_options_check" check (jsonb_typeof(options) = 'array'::text),
  constraint "yare_question_bank_difficulty_check" check (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])),
  constraint "yare_question_bank_subject_check" check (subject = ANY (ARRAY['math'::text, 'persian'::text, 'dictation'::text, 'science'::text, 'social'::text, 'gifts'::text])),
  constraint "yare_question_bank_lesson_id_check" check (lesson_id >= 1 AND lesson_id <= 100)
);

create table public."yare_question_answer_keys" (
  "question_id" uuid not null,
  "accepted" jsonb not null,
  "explanation" text default ''::text not null,
  "updated_at" timestamptz default now() not null,
  primary key ("question_id"),
  constraint "yare_question_answer_keys_accepted_check" check (jsonb_typeof(accepted) = 'array'::text)
);

create table public."yare_practice_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "student_id" uuid not null,
  "class_id" uuid,
  "question_id" uuid,
  "attempt_group" uuid,
  "source" text default 'practice'::text not null,
  "chapter_id" smallint,
  "question_text" text default ''::text not null,
  "question_type" text default 'unknown'::text not null,
  "submitted_answer" jsonb,
  "is_correct" boolean not null,
  "scoring_source" text default 'server'::text not null,
  "created_at" timestamptz default now() not null,
  "client_attempt_id" uuid,
  "offline_sync" boolean default false not null,
  primary key ("id"),
  constraint "yare_practice_attempts_chapter_id_check" check (chapter_id >= 0 AND chapter_id <= 7),
  constraint "yare_practice_attempts_scoring_source_check" check (scoring_source = ANY (ARRAY['server'::text, 'manual'::text]))
);

create table public."yare_assignments" (
  "id" uuid default gen_random_uuid() not null,
  "class_id" uuid not null,
  "title" text not null,
  "activity_type" text default 'practice'::text not null,
  "scope" text default 'chapter'::text not null,
  "chapter_ids" smallint[] default ARRAY[(1)::smallint] not null,
  "question_count" integer default 20 not null,
  "duration_minutes" integer default 0 not null,
  "max_attempts" integer default 1 not null,
  "random_questions" boolean default true not null,
  "random_options" boolean default true not null,
  "show_feedback" boolean default true not null,
  "hide_score_from_peers" boolean default true not null,
  "is_published" boolean default false not null,
  "available_from" timestamptz,
  "available_until" timestamptz,
  "created_by" uuid not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  "subject" text default 'math'::text not null,
  "lesson_ids" smallint[] default ARRAY[(1)::smallint] not null,
  primary key ("id"),
  constraint "yare_assignments_title_check" check (char_length(title) >= 1 AND char_length(title) <= 160),
  constraint "yare_assignments_activity_type_check" check (activity_type = ANY (ARRAY['practice'::text, 'exam'::text, 'term1'::text, 'term2'::text])),
  constraint "yare_assignments_scope_check" check (scope = ANY (ARRAY['chapter'::text, 'multi'::text, 'midterm'::text, 'final'::text, 'all'::text])),
  constraint "yare_assignments_chapter_ids_check" check (cardinality(chapter_ids) >= 1 AND cardinality(chapter_ids) <= 7),
  constraint "yare_assignments_question_count_check" check (question_count >= 1 AND question_count <= 200),
  constraint "yare_assignments_duration_minutes_check" check (duration_minutes >= 0 AND duration_minutes <= 300),
  constraint "yare_assignments_max_attempts_check" check (max_attempts >= 1 AND max_attempts <= 100),
  constraint "yare_assignments_subject_check" check (subject = ANY (ARRAY['math'::text, 'persian'::text, 'dictation'::text, 'science'::text, 'social'::text, 'gifts'::text])),
  constraint "yare_assignments_lesson_ids_check" check (cardinality(lesson_ids) >= 1 AND cardinality(lesson_ids) <= 100)
);

create table public."yare_assignment_questions" (
  "assignment_id" uuid not null,
  "question_id" uuid not null,
  "ordinal" integer not null,
  "option_order" jsonb default '[]'::jsonb not null,
  primary key ("assignment_id", "question_id"),
  constraint "yare_assignment_questions_ordinal_check" check (ordinal > 0)
);

create table public."yare_assignment_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "assignment_id" uuid not null,
  "student_id" uuid not null,
  "class_id" uuid not null,
  "attempt_number" integer not null,
  "status" text default 'in_progress'::text not null,
  "started_at" timestamptz default now() not null,
  "deadline_at" timestamptz,
  "submitted_at" timestamptz,
  "score" numeric,
  "total_points" numeric,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "yare_assignment_attempts_attempt_number_check" check (attempt_number > 0),
  constraint "yare_assignment_attempts_status_check" check (status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'expired'::text, 'graded'::text]))
);

create table public."yare_assignment_responses" (
  "id" uuid default gen_random_uuid() not null,
  "attempt_id" uuid not null,
  "question_id" uuid not null,
  "submitted_answer" jsonb,
  "is_correct" boolean,
  "points" numeric,
  "manual_feedback" text default ''::text not null,
  "graded_by" uuid,
  "graded_at" timestamptz,
  "created_at" timestamptz default now() not null,
  primary key ("id")
);

create table public."yare_learning_materials" (
  "id" uuid default gen_random_uuid() not null,
  "class_id" uuid not null,
  "chapter_id" smallint not null,
  "kind" text not null,
  "title" text not null,
  "file_path" text not null unique,
  "mime_type" text not null,
  "size_bytes" bigint not null,
  "created_by" uuid not null,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "yare_learning_materials_chapter_id_check" check (chapter_id >= 1 AND chapter_id <= 7),
  constraint "yare_learning_materials_kind_check" check (kind = ANY (ARRAY['pdf'::text, 'video'::text, 'image'::text])),
  constraint "yare_learning_materials_size_bytes_check" check (size_bytes > 0)
);

create table public."yare_manual_grades" (
  "id" uuid default gen_random_uuid() not null,
  "attempt_id" uuid not null,
  "response_id" uuid,
  "grader_id" uuid not null,
  "points" numeric not null,
  "feedback" text default ''::text not null,
  "created_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "yare_manual_grades_points_check" check (points >= 0::numeric)
);

create table public."yare_student_credentials" (
  "student_id" uuid not null,
  "class_id" uuid not null,
  "username" text not null unique,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  "encrypted_password" text,
  primary key ("student_id")
);

create table public."yare_student_presence" (
  "student_id" uuid not null,
  "class_id" uuid not null,
  "last_seen_at" timestamptz default now() not null,
  primary key ("student_id")
);

create table public."yare_subject_practice_progress" (
  "id" uuid default gen_random_uuid() not null,
  "student_id" uuid not null,
  "class_id" uuid,
  "subject" text not null,
  "lesson_id" integer not null,
  "activity_key" text not null,
  "activity_type" text default 'practice'::text not null,
  "selected_answer" smallint,
  "correct_answer" smallint,
  "is_correct" boolean default false not null,
  "attempt_count" integer default 1 not null,
  "question_text" text default ''::text not null,
  "explanation" text default ''::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "updated_at" timestamptz default now() not null,
  "created_at" timestamptz default now() not null,
  "scoring_source" text default 'self_reported'::text not null,
  primary key ("id"),
  constraint "yare_subject_practice_progress_subject_check" check (subject = ANY (ARRAY['science'::text, 'persian'::text, 'social'::text, 'gifts'::text, 'dictation'::text])),
  constraint "yare_subject_practice_progress_lesson_id_check" check (lesson_id >= 1 AND lesson_id <= 100),
  constraint "yare_subject_practice_progress_activity_key_check" check (length(activity_key) >= 1 AND length(activity_key) <= 80),
  constraint "yare_subject_practice_progress_activity_type_check" check (length(activity_type) <= 80),
  constraint "yare_subject_practice_progress_selected_answer_check" check (selected_answer >= 0 AND selected_answer <= 100),
  constraint "yare_subject_practice_progress_correct_answer_check" check (correct_answer >= 0 AND correct_answer <= 100),
  constraint "yare_subject_practice_progress_attempt_count_check" check (attempt_count >= 1),
  constraint "yare_subject_practice_progress_scoring_source_check" check (scoring_source = ANY (ARRAY['self_reported'::text, 'server'::text]))
);

create table public."yare_course_settings" (
  "id" uuid default gen_random_uuid() not null,
  "class_id" uuid not null,
  "subject" text not null,
  "settings" jsonb default '{}'::jsonb not null,
  "updated_by" uuid,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  primary key ("id"),
  constraint "yare_course_settings_subject_check" check (subject = ANY (ARRAY['math'::text, 'persian'::text, 'dictation'::text, 'science'::text, 'social'::text, 'gifts'::text]))
);

create table public."yare_student_attendance_days" (
  "student_id" uuid not null,
  "class_id" uuid not null,
  "jalali_year" smallint not null,
  "jalali_month" smallint not null,
  "jalali_day" smallint not null,
  "first_seen_at" timestamptz not null,
  "last_seen_at" timestamptz not null,
  "active_seconds" integer default 0 not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  primary key ("student_id", "jalali_year", "jalali_month", "jalali_day"),
  constraint "yare_student_attendance_days_jalali_year_check" check (jalali_year >= 1300 AND jalali_year <= 1500),
  constraint "yare_student_attendance_days_jalali_month_check" check (jalali_month >= 1 AND jalali_month <= 12),
  constraint "yare_student_attendance_days_jalali_day_check" check (jalali_day >= 1 AND jalali_day <= 31),
  constraint "yare_student_attendance_days_active_seconds_check" check (active_seconds >= 0)
);

create table public."yare_student_monthly_evaluations" (
  "student_id" uuid not null,
  "class_id" uuid not null,
  "jalali_year" smallint not null,
  "jalali_month" smallint not null,
  "quran" text,
  "persian" text,
  "math" text,
  "science" text,
  "social_studies" text,
  "heavenly_gifts" text,
  "art" text,
  "physical_education" text,
  "updated_by" uuid,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null,
  primary key ("student_id", "jalali_year", "jalali_month"),
  constraint "yare_student_monthly_evaluations_jalali_year_check" check (jalali_year >= 1300 AND jalali_year <= 1500),
  constraint "yare_student_monthly_evaluations_jalali_month_check" check (jalali_month = ANY (ARRAY[1, 2, 3, 7, 8, 9, 10, 11, 12])),
  constraint "yare_student_monthly_evaluations_quran_check" check (quran IS NULL OR (quran = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_persian_check" check (persian IS NULL OR (persian = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_math_check" check (math IS NULL OR (math = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_science_check" check (science IS NULL OR (science = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_social_studies_check" check (social_studies IS NULL OR (social_studies = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_heavenly_gifts_check" check (heavenly_gifts IS NULL OR (heavenly_gifts = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_art_check" check (art IS NULL OR (art = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text]))),
  constraint "yare_student_monthly_evaluations_physical_education_check" check (physical_education IS NULL OR (physical_education = ANY (ARRAY['خ.خ'::text, 'خ'::text, 'ق.ق'::text, 'ن.ت'::text])))
);

-- Foreign keys (added after all tables exist)
alter table public."classes" add constraint "classes_teacher_id_fkey" foreign key ("teacher_id") references auth.users ("id");
alter table public."profiles" add constraint "profiles_class_id_fkey" foreign key ("class_id") references public.classes ("id");
alter table public."profiles" add constraint "profiles_id_fkey" foreign key ("id") references auth.users ("id");
alter table public."questions" add constraint "questions_owner_teacher_id_fkey" foreign key ("owner_teacher_id") references auth.users ("id");
alter table public."questions" add constraint "questions_chapter_id_fkey" foreign key ("chapter_id") references public.chapters ("id");
alter table public."question_answer_keys" add constraint "question_answer_keys_question_id_fkey" foreign key ("question_id") references public.questions ("id");
alter table public."assignments" add constraint "assignments_teacher_id_fkey" foreign key ("teacher_id") references auth.users ("id");
alter table public."assignments" add constraint "assignments_class_id_fkey" foreign key ("class_id") references public.classes ("id");
alter table public."assignments" add constraint "assignments_chapter_id_fkey" foreign key ("chapter_id") references public.chapters ("id");
alter table public."assignment_questions" add constraint "assignment_questions_question_id_fkey" foreign key ("question_id") references public.questions ("id");
alter table public."assignment_questions" add constraint "assignment_questions_assignment_id_fkey" foreign key ("assignment_id") references public.assignments ("id");
alter table public."submissions" add constraint "submissions_student_id_fkey" foreign key ("student_id") references public.profiles ("id");
alter table public."submissions" add constraint "submissions_assignment_id_fkey" foreign key ("assignment_id") references public.assignments ("id");
alter table public."submission_answers" add constraint "submission_answers_submission_id_fkey" foreign key ("submission_id") references public.submissions ("id");
alter table public."submission_answers" add constraint "submission_answers_question_id_fkey" foreign key ("question_id") references public.questions ("id");
alter table public."student_progress" add constraint "student_progress_student_id_fkey" foreign key ("student_id") references public.profiles ("id");
alter table public."student_progress" add constraint "student_progress_chapter_id_fkey" foreign key ("chapter_id") references public.chapters ("id");
alter table public."learning_events" add constraint "learning_events_student_id_fkey" foreign key ("student_id") references public.profiles ("id");
alter table public."learning_events" add constraint "learning_events_question_id_fkey" foreign key ("question_id") references public.questions ("id");
alter table public."learning_events" add constraint "learning_events_chapter_id_fkey" foreign key ("chapter_id") references public.chapters ("id");
alter table public."learning_materials" add constraint "learning_materials_teacher_id_fkey" foreign key ("teacher_id") references auth.users ("id");
alter table public."learning_materials" add constraint "learning_materials_chapter_id_fkey" foreign key ("chapter_id") references public.chapters ("id");
alter table public."yare_classes" add constraint "yare_classes_teacher_id_fkey" foreign key ("teacher_id") references auth.users ("id");
alter table public."yare_profiles" add constraint "yare_profiles_id_fkey" foreign key ("id") references auth.users ("id");
alter table public."yare_profiles" add constraint "yare_profiles_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_question_bank" add constraint "yare_question_bank_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_question_bank" add constraint "yare_question_bank_created_by_fkey" foreign key ("created_by") references auth.users ("id");
alter table public."yare_question_answer_keys" add constraint "yare_question_answer_keys_question_id_fkey" foreign key ("question_id") references public.yare_question_bank ("id");
alter table public."yare_practice_attempts" add constraint "yare_practice_attempts_question_id_fkey" foreign key ("question_id") references public.yare_question_bank ("id");
alter table public."yare_practice_attempts" add constraint "yare_practice_attempts_student_id_fkey" foreign key ("student_id") references auth.users ("id");
alter table public."yare_practice_attempts" add constraint "yare_practice_attempts_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_assignments" add constraint "yare_assignments_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_assignments" add constraint "yare_assignments_created_by_fkey" foreign key ("created_by") references auth.users ("id");
alter table public."yare_assignment_questions" add constraint "yare_assignment_questions_question_id_fkey" foreign key ("question_id") references public.yare_question_bank ("id");
alter table public."yare_assignment_questions" add constraint "yare_assignment_questions_assignment_id_fkey" foreign key ("assignment_id") references public.yare_assignments ("id");
alter table public."yare_assignment_attempts" add constraint "yare_assignment_attempts_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_assignment_attempts" add constraint "yare_assignment_attempts_assignment_id_fkey" foreign key ("assignment_id") references public.yare_assignments ("id");
alter table public."yare_assignment_attempts" add constraint "yare_assignment_attempts_student_id_fkey" foreign key ("student_id") references auth.users ("id");
alter table public."yare_assignment_responses" add constraint "yare_assignment_responses_question_id_fkey" foreign key ("question_id") references public.yare_question_bank ("id");
alter table public."yare_assignment_responses" add constraint "yare_assignment_responses_attempt_id_fkey" foreign key ("attempt_id") references public.yare_assignment_attempts ("id");
alter table public."yare_assignment_responses" add constraint "yare_assignment_responses_graded_by_fkey" foreign key ("graded_by") references auth.users ("id");
alter table public."yare_learning_materials" add constraint "yare_learning_materials_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_learning_materials" add constraint "yare_learning_materials_created_by_fkey" foreign key ("created_by") references auth.users ("id");
alter table public."yare_manual_grades" add constraint "yare_manual_grades_attempt_id_fkey" foreign key ("attempt_id") references public.yare_assignment_attempts ("id");
alter table public."yare_manual_grades" add constraint "yare_manual_grades_response_id_fkey" foreign key ("response_id") references public.yare_assignment_responses ("id");
alter table public."yare_manual_grades" add constraint "yare_manual_grades_grader_id_fkey" foreign key ("grader_id") references auth.users ("id");
alter table public."yare_student_credentials" add constraint "yare_student_credentials_student_id_fkey" foreign key ("student_id") references public.yare_profiles ("id");
alter table public."yare_student_presence" add constraint "yare_student_presence_student_id_fkey" foreign key ("student_id") references public.yare_profiles ("id");
alter table public."yare_subject_practice_progress" add constraint "yare_subject_practice_progress_student_id_fkey" foreign key ("student_id") references public.yare_profiles ("id");
alter table public."yare_subject_practice_progress" add constraint "yare_subject_practice_progress_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_course_settings" add constraint "yare_course_settings_updated_by_fkey" foreign key ("updated_by") references auth.users ("id");
alter table public."yare_course_settings" add constraint "yare_course_settings_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_student_attendance_days" add constraint "yare_student_attendance_days_student_id_fkey" foreign key ("student_id") references public.yare_profiles ("id");
alter table public."yare_student_attendance_days" add constraint "yare_student_attendance_days_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_student_monthly_evaluations" add constraint "yare_student_monthly_evaluations_class_id_fkey" foreign key ("class_id") references public.yare_classes ("id");
alter table public."yare_student_monthly_evaluations" add constraint "yare_student_monthly_evaluations_student_id_fkey" foreign key ("student_id") references public.yare_profiles ("id");
alter table public."yare_student_monthly_evaluations" add constraint "yare_student_monthly_evaluations_updated_by_fkey" foreign key ("updated_by") references auth.users ("id");

-- Unique constraints
alter table public."assignment_questions" add constraint "assignment_questions_assignment_id_position_key" unique (assignment_id, "position");
alter table public."submission_answers" add constraint "submission_answers_submission_id_question_id_key" unique (submission_id, question_id);
alter table public."submissions" add constraint "submissions_assignment_id_student_id_attempt_number_key" unique (assignment_id, student_id, attempt_number);
alter table public."yare_assignment_attempts" add constraint "yare_assignment_attempts_assignment_id_student_id_attempt_n_key" unique (assignment_id, student_id, attempt_number);
alter table public."yare_assignment_questions" add constraint "yare_assignment_questions_assignment_id_ordinal_key" unique (assignment_id, ordinal);
alter table public."yare_assignment_responses" add constraint "yare_assignment_responses_attempt_id_question_id_key" unique (attempt_id, question_id);
alter table public."yare_course_settings" add constraint "yare_course_settings_class_id_subject_key" unique (class_id, subject);
alter table public."yare_learning_materials" add constraint "yare_learning_materials_file_path_key" unique (file_path);
alter table public."yare_student_credentials" add constraint "yare_student_credentials_username_key" unique (username);
alter table public."yare_subject_practice_progress" add constraint "yare_subject_practice_progress_student_activity_unique" unique (student_id, subject, lesson_id, activity_key);

-- Indexes
create index assignments_class_status_idx on public.assignments using btree (class_id, status);
create index events_student_chapter_idx on public.learning_events using btree (student_id, chapter_id, created_at desc);
create index questions_chapter_published_idx on public.questions using btree (chapter_id, is_published);
create index submissions_student_idx on public.submissions using btree (student_id, submitted_at desc);
create index yare_assignment_attempts_student_idx on public.yare_assignment_attempts using btree (student_id, started_at desc);
create index yare_assignments_class_published_idx on public.yare_assignments using btree (class_id, is_published, created_at desc);
create index yare_assignments_class_subject_idx on public.yare_assignments using btree (class_id, subject, is_published, created_at desc);
create index yare_practice_attempts_class_time_idx on public.yare_practice_attempts using btree (class_id, created_at desc);
create index yare_practice_attempts_group_idx on public.yare_practice_attempts using btree (attempt_group);
create unique index yare_practice_attempts_student_client_attempt_idx on public.yare_practice_attempts using btree (student_id, client_attempt_id) where client_attempt_id is not null;
create index yare_practice_attempts_student_time_idx on public.yare_practice_attempts using btree (student_id, created_at desc);
create unique index yare_profiles_student_code_unique on public.yare_profiles using btree (student_code) where student_code is not null;
create index yare_question_bank_class_chapter_idx on public.yare_question_bank using btree (class_id, chapter_id, sort_order);
create index yare_question_bank_class_subject_lesson_idx on public.yare_question_bank using btree (class_id, subject, lesson_id, is_active);
create index idx_yare_student_attendance_class_month on public.yare_student_attendance_days using btree (class_id, jalali_year, jalali_month, jalali_day);
create index yare_student_monthly_evaluations_class_month_idx on public.yare_student_monthly_evaluations using btree (class_id, jalali_year, jalali_month);
create index yare_student_presence_class_seen_idx on public.yare_student_presence using btree (class_id, last_seen_at desc);
create index yare_subject_practice_progress_class_subject_idx on public.yare_subject_practice_progress using btree (class_id, subject, updated_at desc);
create index yare_subject_practice_progress_student_updated_idx on public.yare_subject_practice_progress using btree (student_id, updated_at desc);

-- Helper routines and RPCs
CREATE OR REPLACE FUNCTION public.is_student_in_class(p_class uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.class_id=p_class) $function$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_class(p_class uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.classes c where c.id=p_class and c.teacher_id=auth.uid()) $function$;

CREATE OR REPLACE FUNCTION public.owns_question(p_question uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.questions q where q.id=p_question and q.owner_teacher_id=auth.uid()) $function$;

CREATE OR REPLACE FUNCTION public.record_yare_student_attendance_heartbeat(p_student_id uuid, p_class_id uuid, p_jalali_year integer, p_jalali_month integer, p_jalali_day integer, p_seen_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.yare_student_attendance_days (
    student_id, class_id, jalali_year, jalali_month, jalali_day,
    first_seen_at, last_seen_at, active_seconds, created_at, updated_at
  )
  values (
    p_student_id, p_class_id, p_jalali_year, p_jalali_month, p_jalali_day,
    p_seen_at, p_seen_at, 0, now(), now()
  )
  on conflict (student_id, jalali_year, jalali_month, jalali_day)
  do update set
    class_id = excluded.class_id,
    first_seen_at = least(public.yare_student_attendance_days.first_seen_at, excluded.first_seen_at),
    active_seconds = public.yare_student_attendance_days.active_seconds +
      case
        when excluded.last_seen_at > public.yare_student_attendance_days.last_seen_at
          and extract(epoch from (excluded.last_seen_at - public.yare_student_attendance_days.last_seen_at)) between 1 and 90
        then extract(epoch from (excluded.last_seen_at - public.yare_student_attendance_days.last_seen_at))::integer
        else 0
      end,
    last_seen_at = greatest(public.yare_student_attendance_days.last_seen_at, excluded.last_seen_at),
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.yare_current_user_class_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ select p.class_id from public.yare_profiles p where p.id = auth.uid() limit 1 $function$;

CREATE OR REPLACE FUNCTION public.yare_current_user_is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ select exists(select 1 from public.yare_profiles p where p.id = auth.uid() and p.role = 'teacher') $function$;

CREATE OR REPLACE FUNCTION public.yare_force_subject_progress_self_reported()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Direct REST writes by students are always self-reported. Only a trusted
  -- service-role process may write the reserved server value.
  if auth.role() <> 'service_role' then
    new.scoring_source := 'self_reported';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.yare_list_student_credential_status(p_class_id uuid)
 RETURNS TABLE(student_id uuid, has_password boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select c.student_id, (c.encrypted_password is not null) as has_password from public.yare_student_credentials c where c.class_id = p_class_id; $function$;

CREATE OR REPLACE FUNCTION public.yare_list_student_credentials(p_class_id uuid)
 RETURNS TABLE(student_id uuid, initial_password text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key text;
begin
  select d.decrypted_secret into v_key
  from vault.decrypted_secrets as d
  where d.name = 'yare_student_password_encryption_key';
  if v_key is null then
    raise exception 'Credential encryption key is unavailable';
  end if;

  return query
  select c.student_id,
         extensions.pgp_sym_decrypt(decode(c.encrypted_password, 'base64'), v_key)
  from public.yare_student_credentials as c
  where c.class_id = p_class_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.yare_save_question_with_key(p_question_id uuid, p_source_question_id uuid, p_class_id uuid, p_chapter_id smallint, p_subject text, p_lesson_id smallint, p_skill text, p_prompt text, p_question_type text, p_options jsonb, p_difficulty text, p_accepted jsonb, p_explanation text, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_id uuid; v_sort integer; begin if p_class_id is null then raise exception 'class_id is required'; end if; if p_question_id is not null then update public.yare_question_bank set chapter_id=p_chapter_id, subject=p_subject, lesson_id=p_lesson_id, skill=p_skill, prompt=p_prompt, question_type=p_question_type, options=coalesce(p_options,'[]'::jsonb), difficulty=p_difficulty, updated_at=now() where id=p_question_id and class_id=p_class_id; if not found then raise exception 'question not found for this class'; end if; v_id:=p_question_id; elsif p_source_question_id is not null then select sort_order into v_sort from public.yare_question_bank where id=p_source_question_id and class_id is null; if not found then raise exception 'public question not found'; end if; insert into public.yare_question_bank (class_id,chapter_id,subject,lesson_id,skill,prompt,question_type,options,difficulty,sort_order,is_active,created_by) values (p_class_id,p_chapter_id,p_subject,p_lesson_id,p_skill,p_prompt,p_question_type,coalesce(p_options,'[]'::jsonb),p_difficulty,coalesce(v_sort,1000)+1,true,p_created_by) returning id into v_id; else insert into public.yare_question_bank (class_id,chapter_id,subject,lesson_id,skill,prompt,question_type,options,difficulty,sort_order,is_active,created_by) values (p_class_id,p_chapter_id,p_subject,p_lesson_id,p_skill,p_prompt,p_question_type,coalesce(p_options,'[]'::jsonb),p_difficulty,1000+(floor(random()*1000000))::integer,true,p_created_by) returning id into v_id; end if; insert into public.yare_question_answer_keys (question_id,accepted,explanation,updated_at) values (v_id,coalesce(p_accepted,'[]'::jsonb),coalesce(p_explanation,''),now()) on conflict (question_id) do update set accepted=excluded.accepted, explanation=excluded.explanation, updated_at=now(); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.yare_store_student_credential(p_student_id uuid, p_class_id uuid, p_username text, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key text;
begin
  select d.decrypted_secret into v_key
  from vault.decrypted_secrets as d
  where d.name = 'yare_student_password_encryption_key';
  if v_key is null then
    raise exception 'Credential encryption key is unavailable';
  end if;

  insert into public.yare_student_credentials
    (student_id, class_id, username, encrypted_password, updated_at)
  values
    (p_student_id, p_class_id, p_username,
     encode(extensions.pgp_sym_encrypt(p_password, v_key, 'cipher-algo=aes256'), 'base64'),
     now())
  on conflict (student_id) do update set
    class_id = excluded.class_id,
    username = excluded.username,
    encrypted_password = excluded.encrypted_password,
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.yare_teacher_can_access_class(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select target_class_id is not null and (
    exists(select 1 from public.yare_classes c where c.id = target_class_id and c.teacher_id = auth.uid())
    or exists(select 1 from public.yare_profiles p where p.id = auth.uid() and p.role = 'teacher' and p.class_id = target_class_id)
  )
$function$;

-- Row level security
alter table public."classes" enable row level security;
alter table public."profiles" enable row level security;
alter table public."chapters" enable row level security;
alter table public."questions" enable row level security;
alter table public."question_answer_keys" enable row level security;
alter table public."assignments" enable row level security;
alter table public."assignment_questions" enable row level security;
alter table public."submissions" enable row level security;
alter table public."submission_answers" enable row level security;
alter table public."student_progress" enable row level security;
alter table public."learning_events" enable row level security;
alter table public."learning_materials" enable row level security;
alter table public."yare_classes" enable row level security;
alter table public."yare_profiles" enable row level security;
alter table public."yare_question_bank" enable row level security;
alter table public."yare_question_answer_keys" enable row level security;
alter table public."yare_practice_attempts" enable row level security;
alter table public."yare_assignments" enable row level security;
alter table public."yare_assignment_questions" enable row level security;
alter table public."yare_assignment_attempts" enable row level security;
alter table public."yare_assignment_responses" enable row level security;
alter table public."yare_learning_materials" enable row level security;
alter table public."yare_manual_grades" enable row level security;
alter table public."yare_student_credentials" enable row level security;
alter table public."yare_student_presence" enable row level security;
alter table public."yare_subject_practice_progress" enable row level security;
alter table public."yare_course_settings" enable row level security;
alter table public."yare_student_attendance_days" enable row level security;
alter table public."yare_student_monthly_evaluations" enable row level security;

-- Policies
create policy "students read question links for published assignments" on public."assignment_questions" for select to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = assignment_questions.assignment_id) AND (a.status = 'published'::assignment_status) AND is_student_in_class(a.class_id)))));
create policy "teacher manages assignment questions" on public."assignment_questions" for all to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = assignment_questions.assignment_id) AND (a.teacher_id = auth.uid()))))) with check (((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = assignment_questions.assignment_id) AND (a.teacher_id = auth.uid())))) AND owns_question(question_id)));
create policy "students read published class assignments" on public."assignments" for select to authenticated using (((status = 'published'::assignment_status) AND is_student_in_class(class_id)));
create policy "teacher manages assignments" on public."assignments" for all to authenticated using ((teacher_id = auth.uid())) with check (((teacher_id = auth.uid()) AND is_teacher_of_class(class_id)));
create policy "chapters readable" on public."chapters" for select to authenticated using (true);
create policy "teacher manages own classes" on public."classes" for all to authenticated using ((teacher_id = auth.uid())) with check ((teacher_id = auth.uid()));
create policy "student creates own learning events" on public."learning_events" for insert to authenticated with check ((student_id = auth.uid()));
create policy "student reads own events or teacher reads class events" on public."learning_events" for select to authenticated using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = learning_events.student_id) AND (p.class_id IS NOT NULL) AND is_teacher_of_class(p.class_id))))));
create policy "students read published materials" on public."learning_materials" for select to authenticated using (((is_published = true) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'student'::app_role))))));
create policy "teacher manages own materials" on public."learning_materials" for all to authenticated using ((teacher_id = auth.uid())) with check ((teacher_id = auth.uid()));
create policy "profile update self" on public."profiles" for update to authenticated using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "profiles read self or class teacher" on public."profiles" for select to authenticated using (((id = auth.uid()) OR ((class_id IS NOT NULL) AND is_teacher_of_class(class_id))));
create policy "teacher manages answer keys" on public."question_answer_keys" for all to authenticated using (owns_question(question_id)) with check (owns_question(question_id));
create policy "students read published questions" on public."questions" for select to authenticated using (((is_published = true) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'student'::app_role))))));
create policy "teacher manages own questions" on public."questions" for all to authenticated using ((owner_teacher_id = auth.uid())) with check ((owner_teacher_id = auth.uid()));
create policy "student reads own progress or teacher class progress" on public."student_progress" for select to authenticated using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = student_progress.student_id) AND (p.class_id IS NOT NULL) AND is_teacher_of_class(p.class_id))))));
create policy "student updates own progress" on public."student_progress" for all to authenticated using ((student_id = auth.uid())) with check ((student_id = auth.uid()));
create policy "answers visible to own student or teacher" on public."submission_answers" for select to authenticated using ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_answers.submission_id) AND ((s.student_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM assignments a
          WHERE ((a.id = s.assignment_id) AND is_teacher_of_class(a.class_id)))))))));
create policy "student writes own submission answers" on public."submission_answers" for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_answers.submission_id) AND (s.student_id = auth.uid()) AND (s.status = 'in_progress'::text)))));
create policy "student inserts own submission" on public."submissions" for insert to authenticated with check (((student_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'student'::app_role)))) AND (EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.status = 'published'::assignment_status) AND is_student_in_class(a.class_id))))));
create policy "student reads own submissions or teacher reads class" on public."submissions" for select to authenticated using (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = submissions.assignment_id) AND is_teacher_of_class(a.class_id))))));
create policy "student updates own in progress submission" on public."submissions" for update to authenticated using (((student_id = auth.uid()) AND (status = 'in_progress'::text))) with check ((student_id = auth.uid()));
create policy "yare_assignment_attempts_student_or_teacher_read" on public."yare_assignment_attempts" for select to authenticated using (((student_id = auth.uid()) OR yare_teacher_can_access_class(class_id)));
create policy "yare_assignment_questions_teacher_read" on public."yare_assignment_questions" for select to authenticated using ((EXISTS ( SELECT 1
   FROM yare_assignments a
  WHERE ((a.id = yare_assignment_questions.assignment_id) AND yare_teacher_can_access_class(a.class_id)))));
create policy "yare_assignment_responses_student_or_teacher_read" on public."yare_assignment_responses" for select to authenticated using ((EXISTS ( SELECT 1
   FROM yare_assignment_attempts t
  WHERE ((t.id = yare_assignment_responses.attempt_id) AND ((t.student_id = auth.uid()) OR yare_teacher_can_access_class(t.class_id))))));
create policy "yare_assignments_student_read_published" on public."yare_assignments" for select to authenticated using ((is_published AND (class_id = yare_current_user_class_id())));
create policy "yare_assignments_teacher_all" on public."yare_assignments" for all to authenticated using (yare_teacher_can_access_class(class_id)) with check ((yare_teacher_can_access_class(class_id) AND (created_by = auth.uid())));
create policy "classes_select_own_or_member" on public."yare_classes" for select to authenticated using (((teacher_id = auth.uid()) OR (id = yare_current_user_class_id())));
create policy "yare_learning_materials_read_class" on public."yare_learning_materials" for select to authenticated using (((class_id = yare_current_user_class_id()) OR yare_teacher_can_access_class(class_id)));
create policy "yare_learning_materials_teacher_manage" on public."yare_learning_materials" for all to authenticated using (yare_teacher_can_access_class(class_id)) with check ((yare_teacher_can_access_class(class_id) AND (created_by = auth.uid())));
create policy "yare_manual_grades_teacher_read" on public."yare_manual_grades" for select to authenticated using ((EXISTS ( SELECT 1
   FROM yare_assignment_attempts t
  WHERE ((t.id = yare_manual_grades.attempt_id) AND yare_teacher_can_access_class(t.class_id)))));
create policy "practice_attempts_select_self_or_teacher" on public."yare_practice_attempts" for select to authenticated using (((student_id = auth.uid()) OR yare_teacher_can_access_class(class_id)));
create policy "profiles_select_self_or_teacher" on public."yare_profiles" for select to authenticated using (((id = auth.uid()) OR yare_teacher_can_access_class(class_id)));
create policy "profiles_update_self" on public."yare_profiles" for update to authenticated using ((id = auth.uid())) with check ((id = auth.uid()));
create policy "yare_answer_keys_deny_client" on public."yare_question_answer_keys" for all to anon, authenticated using (false) with check (false);
create policy "question_bank_select_student_or_teacher" on public."yare_question_bank" for select to authenticated using (((is_active AND ((class_id IS NULL) OR (class_id = yare_current_user_class_id()))) OR (yare_current_user_is_teacher() AND ((class_id IS NULL) OR yare_teacher_can_access_class(class_id)))));
create policy "yare_student_monthly_evaluations_read_self_or_teacher" on public."yare_student_monthly_evaluations" for select to authenticated using (((student_id = ( SELECT auth.uid() AS uid)) OR yare_teacher_can_access_class(class_id)));
create policy "yare_student_monthly_evaluations_teacher_insert" on public."yare_student_monthly_evaluations" for insert to authenticated with check ((yare_teacher_can_access_class(class_id) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM yare_profiles student_profile
  WHERE ((student_profile.id = yare_student_monthly_evaluations.student_id) AND (student_profile.class_id = yare_student_monthly_evaluations.class_id) AND (student_profile.role = 'student'::text))))));
create policy "yare_student_monthly_evaluations_teacher_update" on public."yare_student_monthly_evaluations" for update to authenticated using (yare_teacher_can_access_class(class_id)) with check ((yare_teacher_can_access_class(class_id) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM yare_profiles student_profile
  WHERE ((student_profile.id = yare_student_monthly_evaluations.student_id) AND (student_profile.class_id = yare_student_monthly_evaluations.class_id) AND (student_profile.role = 'student'::text))))));
create policy "yare_subject_progress_insert_self" on public."yare_subject_practice_progress" for insert to authenticated with check (((student_id = ( SELECT auth.uid() AS uid)) AND (NOT (class_id IS DISTINCT FROM ( SELECT p.class_id
   FROM yare_profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))))));
create policy "yare_subject_progress_select_self_or_teacher" on public."yare_subject_practice_progress" for select to authenticated using (((student_id = ( SELECT auth.uid() AS uid)) OR yare_teacher_can_access_class(class_id)));
create policy "yare_subject_progress_update_self" on public."yare_subject_practice_progress" for update to authenticated using ((student_id = ( SELECT auth.uid() AS uid))) with check (((student_id = ( SELECT auth.uid() AS uid)) AND (NOT (class_id IS DISTINCT FROM ( SELECT p.class_id
   FROM yare_profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))))));

-- Trigger for self-reported non-math progress
create trigger yare_subject_progress_force_self_reported before insert or update on public.yare_subject_practice_progress for each row execute function public.yare_force_subject_progress_self_reported();

-- Function execution grants (mirror the live project; sensitive routines are service-role only)
revoke all on function public."is_student_in_class"(p_class uuid) from public;
grant execute on function public."is_student_in_class"(p_class uuid) to authenticated;
grant execute on function public."is_student_in_class"(p_class uuid) to service_role;
revoke all on function public."is_teacher_of_class"(p_class uuid) from public;
grant execute on function public."is_teacher_of_class"(p_class uuid) to authenticated;
grant execute on function public."is_teacher_of_class"(p_class uuid) to service_role;
revoke all on function public."owns_question"(p_question uuid) from public;
grant execute on function public."owns_question"(p_question uuid) to authenticated;
grant execute on function public."owns_question"(p_question uuid) to service_role;
revoke all on function public."record_yare_student_attendance_heartbeat"(p_student_id uuid, p_class_id uuid, p_jalali_year integer, p_jalali_month integer, p_jalali_day integer, p_seen_at timestamp with time zone) from public;
grant execute on function public."record_yare_student_attendance_heartbeat"(p_student_id uuid, p_class_id uuid, p_jalali_year integer, p_jalali_month integer, p_jalali_day integer, p_seen_at timestamp with time zone) to service_role;
revoke all on function public."rls_auto_enable"() from public;
grant execute on function public."rls_auto_enable"() to service_role;
revoke all on function public."yare_current_user_class_id"() from public;
grant execute on function public."yare_current_user_class_id"() to authenticated;
grant execute on function public."yare_current_user_class_id"() to service_role;
revoke all on function public."yare_current_user_is_teacher"() from public;
grant execute on function public."yare_current_user_is_teacher"() to authenticated;
grant execute on function public."yare_current_user_is_teacher"() to service_role;
revoke all on function public."yare_force_subject_progress_self_reported"() from public;
grant execute on function public."yare_force_subject_progress_self_reported"() to authenticated;
grant execute on function public."yare_force_subject_progress_self_reported"() to service_role;
revoke all on function public."yare_list_student_credential_status"(p_class_id uuid) from public;
grant execute on function public."yare_list_student_credential_status"(p_class_id uuid) to service_role;
revoke all on function public."yare_list_student_credentials"(p_class_id uuid) from public;
grant execute on function public."yare_list_student_credentials"(p_class_id uuid) to service_role;
revoke all on function public."yare_save_question_with_key"(p_question_id uuid, p_source_question_id uuid, p_class_id uuid, p_chapter_id smallint, p_subject text, p_lesson_id smallint, p_skill text, p_prompt text, p_question_type text, p_options jsonb, p_difficulty text, p_accepted jsonb, p_explanation text, p_created_by uuid) from public;
grant execute on function public."yare_save_question_with_key"(p_question_id uuid, p_source_question_id uuid, p_class_id uuid, p_chapter_id smallint, p_subject text, p_lesson_id smallint, p_skill text, p_prompt text, p_question_type text, p_options jsonb, p_difficulty text, p_accepted jsonb, p_explanation text, p_created_by uuid) to service_role;
revoke all on function public."yare_store_student_credential"(p_student_id uuid, p_class_id uuid, p_username text, p_password text) from public;
grant execute on function public."yare_store_student_credential"(p_student_id uuid, p_class_id uuid, p_username text, p_password text) to service_role;
revoke all on function public."yare_teacher_can_access_class"(target_class_id uuid) from public;
grant execute on function public."yare_teacher_can_access_class"(target_class_id uuid) to authenticated;
grant execute on function public."yare_teacher_can_access_class"(target_class_id uuid) to service_role;

-- Table grants needed by the app and Edge Functions
grant select, insert, update, delete on public."classes" to service_role;
grant delete, insert, select, update on public."classes" to authenticated;
grant select, insert, update, delete on public."profiles" to service_role;
grant select, update on public."profiles" to authenticated;
grant select, insert, update, delete on public."chapters" to service_role;
grant select on public."chapters" to authenticated;
grant select, insert, update, delete on public."questions" to service_role;
grant delete, insert, select, update on public."questions" to authenticated;
grant select, insert, update, delete on public."question_answer_keys" to service_role;
grant select, insert, update, delete on public."assignments" to service_role;
grant delete, insert, select, update on public."assignments" to authenticated;
grant select, insert, update, delete on public."assignment_questions" to service_role;
grant delete, insert, select, update on public."assignment_questions" to authenticated;
grant select, insert, update, delete on public."submissions" to service_role;
grant insert, select, update on public."submissions" to authenticated;
grant select, insert, update, delete on public."submission_answers" to service_role;
grant insert, select on public."submission_answers" to authenticated;
grant select, insert, update, delete on public."student_progress" to service_role;
grant delete, insert, select, update on public."student_progress" to authenticated;
grant select, insert, update, delete on public."learning_events" to service_role;
grant insert, select on public."learning_events" to authenticated;
grant select, insert, update, delete on public."learning_materials" to service_role;
grant delete, insert, select, update on public."learning_materials" to authenticated;
grant select, insert, update, delete on public."yare_classes" to service_role;
grant select on public."yare_classes" to authenticated;
grant select, insert, update, delete on public."yare_profiles" to service_role;
grant select, update on public."yare_profiles" to authenticated;
grant select, insert, update, delete on public."yare_question_bank" to service_role;
grant select on public."yare_question_bank" to authenticated;
grant select, insert, update, delete on public."yare_question_answer_keys" to service_role;
grant select, insert, update, delete on public."yare_practice_attempts" to service_role;
grant select on public."yare_practice_attempts" to authenticated;
grant select, insert, update, delete on public."yare_assignments" to service_role;
grant delete, insert, select, update on public."yare_assignments" to authenticated;
grant select, insert, update, delete on public."yare_assignment_questions" to service_role;
grant select on public."yare_assignment_questions" to authenticated;
grant select, insert, update, delete on public."yare_assignment_attempts" to service_role;
grant select on public."yare_assignment_attempts" to authenticated;
grant select, insert, update, delete on public."yare_assignment_responses" to service_role;
grant select on public."yare_assignment_responses" to authenticated;
grant select, insert, update, delete on public."yare_learning_materials" to service_role;
grant delete, insert, select, update on public."yare_learning_materials" to authenticated;
grant select, insert, update, delete on public."yare_manual_grades" to service_role;
grant select on public."yare_manual_grades" to authenticated;
grant select, insert, update, delete on public."yare_student_credentials" to service_role;
grant select, insert, update, delete on public."yare_student_presence" to service_role;
grant select, insert, update, delete on public."yare_subject_practice_progress" to service_role;
grant insert, select, update on public."yare_subject_practice_progress" to authenticated;
grant select, insert, update, delete on public."yare_course_settings" to service_role;
grant select, insert, update, delete on public."yare_student_attendance_days" to service_role;
grant select, insert, update, delete on public."yare_student_monthly_evaluations" to service_role;
grant insert, select, update on public."yare_student_monthly_evaluations" to authenticated;

-- Done. Rebuild in a fresh project, then deploy supabase/functions and run smoke tests.
