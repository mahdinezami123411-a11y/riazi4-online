-- Add explicit question kinds for selected-answer blanks and four-pair matching.
-- The browser and Edge Functions use these values when creating, rendering, and grading questions.
alter table public.yare_question_bank
  drop constraint if exists yare_question_bank_question_type_check;

alter table public.yare_question_bank
  add constraint yare_question_bank_question_type_check
  check (
    question_type = any (
      array['mc', 'input', 'tf', 'multi', 'blank_mc', 'matching']::text[]
    )
  );
