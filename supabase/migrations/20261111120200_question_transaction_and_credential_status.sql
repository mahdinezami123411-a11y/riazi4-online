-- BE-08/BE-09: save the question and its answer key in one transaction.
-- A global (class_id is null) question is never mutated: editing it creates a
-- class-owned copy and leaves the shared record untouched.
create or replace function public.yare_save_question_with_key(
  p_question_id uuid,
  p_source_question_id uuid,
  p_class_id uuid,
  p_chapter_id smallint,
  p_subject text,
  p_lesson_id smallint,
  p_skill text,
  p_prompt text,
  p_question_type text,
  p_options jsonb,
  p_difficulty text,
  p_accepted jsonb,
  p_explanation text,
  p_created_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_sort integer;
begin
  if p_class_id is null then
    raise exception 'class_id is required';
  end if;

  if p_question_id is not null then
    update public.yare_question_bank
       set chapter_id = p_chapter_id,
           subject = p_subject,
           lesson_id = p_lesson_id,
           skill = p_skill,
           prompt = p_prompt,
           question_type = p_question_type,
           options = coalesce(p_options, '[]'::jsonb),
           difficulty = p_difficulty,
           updated_at = now()
     where id = p_question_id
       and class_id = p_class_id;
    if not found then
      raise exception 'question not found for this class';
    end if;
    v_id := p_question_id;
  elsif p_source_question_id is not null then
    select sort_order into v_sort
      from public.yare_question_bank
     where id = p_source_question_id
       and class_id is null;
    if not found then
      raise exception 'public question not found';
    end if;
    insert into public.yare_question_bank
      (class_id, chapter_id, subject, lesson_id, skill, prompt, question_type,
       options, difficulty, sort_order, is_active, created_by)
    values
      (p_class_id, p_chapter_id, p_subject, p_lesson_id, p_skill, p_prompt,
       p_question_type, coalesce(p_options, '[]'::jsonb), p_difficulty,
       coalesce(v_sort, 1000) + 1, true, p_created_by)
    returning id into v_id;
  else
    insert into public.yare_question_bank
      (class_id, chapter_id, subject, lesson_id, skill, prompt, question_type,
       options, difficulty, sort_order, is_active, created_by)
    values
      (p_class_id, p_chapter_id, p_subject, p_lesson_id, p_skill, p_prompt,
       p_question_type, coalesce(p_options, '[]'::jsonb), p_difficulty,
       1000 + (floor(random() * 1000000))::integer, true, p_created_by)
    returning id into v_id;
  end if;

  insert into public.yare_question_answer_keys
    (question_id, accepted, explanation, updated_at)
  values
    (v_id, coalesce(p_accepted, '[]'::jsonb), coalesce(p_explanation, ''), now())
  on conflict (question_id) do update
    set accepted = excluded.accepted,
        explanation = excluded.explanation,
        updated_at = now();

  return v_id;
end;
$$;

revoke all on function public.yare_save_question_with_key(uuid,uuid,uuid,smallint,text,smallint,text,text,text,jsonb,text,jsonb,text,uuid) from public;
revoke all on function public.yare_save_question_with_key(uuid,uuid,uuid,smallint,text,smallint,text,text,text,jsonb,text,jsonb,text,uuid) from anon;
revoke all on function public.yare_save_question_with_key(uuid,uuid,uuid,smallint,text,smallint,text,text,text,jsonb,text,jsonb,text,uuid) from authenticated;
grant execute on function public.yare_save_question_with_key(uuid,uuid,uuid,smallint,text,smallint,text,text,text,jsonb,text,jsonb,text,uuid) to service_role;

-- BE-11: the account list needs to know whether a credential exists, but it
-- must not decrypt or return the password.
create or replace function public.yare_list_student_credential_status(p_class_id uuid)
returns table(student_id uuid, has_password boolean)
language sql
security definer
set search_path = public
as $$
  select c.student_id, (c.encrypted_password is not null) as has_password
    from public.yare_student_credentials c
   where c.class_id = p_class_id;
$$;

revoke all on function public.yare_list_student_credential_status(uuid) from public;
revoke all on function public.yare_list_student_credential_status(uuid) from anon;
revoke all on function public.yare_list_student_credential_status(uuid) from authenticated;
grant execute on function public.yare_list_student_credential_status(uuid) to service_role;
