-- Monthly in-person student evaluations for the current Jalali school year.
-- Safe to re-run; the existing table data is preserved.
create table if not exists public.yare_student_monthly_evaluations (
  student_id uuid not null references public.yare_profiles(id) on delete cascade,
  class_id uuid not null references public.yare_classes(id) on delete cascade,
  jalali_year smallint not null check (jalali_year between 1300 and 1500),
  jalali_month smallint not null check (jalali_month in (1, 2, 3, 7, 8, 9, 10, 11, 12)),
  quran text check (quran is null or quran in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  persian text check (persian is null or persian in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  math text check (math is null or math in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  science text check (science is null or science in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  social_studies text check (social_studies is null or social_studies in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  heavenly_gifts text check (heavenly_gifts is null or heavenly_gifts in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  art text check (art is null or art in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  physical_education text check (physical_education is null or physical_education in ('خ.خ', 'خ', 'ق.ق', 'ن.ت')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yare_student_monthly_evaluations_pk primary key (student_id, jalali_year, jalali_month)
);

alter table public.yare_student_monthly_evaluations enable row level security;
revoke all on table public.yare_student_monthly_evaluations from anon, authenticated;
grant select, insert, update on table public.yare_student_monthly_evaluations to authenticated;

create index if not exists yare_student_monthly_evaluations_class_month_idx
  on public.yare_student_monthly_evaluations (class_id, jalali_year, jalali_month);

drop policy if exists yare_student_monthly_evaluations_read_self_or_teacher on public.yare_student_monthly_evaluations;
create policy yare_student_monthly_evaluations_read_self_or_teacher
  on public.yare_student_monthly_evaluations
  for select to authenticated
  using (student_id = (select auth.uid()) or public.yare_teacher_can_access_class(class_id));

drop policy if exists yare_student_monthly_evaluations_teacher_insert on public.yare_student_monthly_evaluations;
create policy yare_student_monthly_evaluations_teacher_insert
  on public.yare_student_monthly_evaluations
  for insert to authenticated
  with check (
    public.yare_teacher_can_access_class(class_id)
    and updated_by = (select auth.uid())
    and exists (
      select 1 from public.yare_profiles as student_profile
      where student_profile.id = yare_student_monthly_evaluations.student_id
        and student_profile.class_id = yare_student_monthly_evaluations.class_id
        and student_profile.role = 'student'
    )
  );

drop policy if exists yare_student_monthly_evaluations_teacher_update on public.yare_student_monthly_evaluations;
create policy yare_student_monthly_evaluations_teacher_update
  on public.yare_student_monthly_evaluations
  for update to authenticated
  using (public.yare_teacher_can_access_class(class_id))
  with check (
    public.yare_teacher_can_access_class(class_id)
    and updated_by = (select auth.uid())
    and exists (
      select 1 from public.yare_profiles as student_profile
      where student_profile.id = yare_student_monthly_evaluations.student_id
        and student_profile.class_id = yare_student_monthly_evaluations.class_id
        and student_profile.role = 'student'
    )
  );
