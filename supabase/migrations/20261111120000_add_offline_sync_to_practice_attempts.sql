-- BE-01: offline queue rows are still scored by the server. Record the
-- transport separately instead of writing a scoring_source value that the
-- existing CHECK constraint rejects.
alter table public.yare_practice_attempts
  add column if not exists offline_sync boolean not null default false;

comment on column public.yare_practice_attempts.offline_sync is
  'True when this server-scored attempt was received from the offline sync queue.';
