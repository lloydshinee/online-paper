-- Incremental schema changes for the code-review-2026-08-r2 fixes.
-- Apply ONCE to an existing database (Supabase SQL editor or psql) before
-- running the test suite. Fresh installs get these automatically through
-- docs/full-migration.sql, which this file mirrors.

-- 1. Close the direct-PostgREST answer-key / grading-data exposure:
--    students read questions, submissions, and answers exclusively through
--    server actions on the service-role client, so they need no direct
--    table policies. RLS stays enabled; no matching policy = deny.
drop policy if exists "Students can read questions for enrolled class assessments" on public.questions;
drop policy if exists "Students manage own submissions" on public.submissions;
drop policy if exists "Students manage own answers" on public.answers;

-- 2. Harden increment_violation: NULL-safe ownership check, and EXECUTE
--    restricted to the service role (the only caller). Without the revokes,
--    Postgres' default PUBLIC EXECUTE let any authenticated/anon JWT call it
--    directly, and p_student_id = null silently passed the ownership check.
create or replace function public.increment_violation(p_submission_id uuid, p_student_id uuid)
returns table (violations int, status text, assessment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status text;
begin
  select public.submissions.student_id, public.submissions.status
    into v_owner, v_status
    from public.submissions where public.submissions.id = p_submission_id;
  if not found then
    return;
  end if;
  -- Ownership binding: only the submission's own student can record
  -- violations. IS DISTINCT FROM keeps a NULL argument from silently
  -- passing the check.
  if p_student_id is null or v_owner is distinct from p_student_id then
    return;
  end if;
  -- Ignore submissions that are not in progress.
  if v_status <> 'in_progress' then
    return;
  end if;

  return query
    update public.submissions
      set violations = public.submissions.violations + 1
      where public.submissions.id = p_submission_id
      returning public.submissions.violations, public.submissions.status, public.submissions.assessment_id;
end;
$$;
revoke execute on function public.increment_violation(uuid, uuid) from public;
revoke execute on function public.increment_violation(uuid, uuid) from anon;
revoke execute on function public.increment_violation(uuid, uuid) from authenticated;
grant execute on function public.increment_violation(uuid, uuid) to service_role;

-- 3. Atomic guarded time-extension increment (service-role only).
create or replace function public.increment_extra_seconds(p_submission_id uuid, p_seconds integer)
returns setof public.submissions
language sql
security definer
set search_path = ''
as $$
  update public.submissions
    set extra_seconds = public.submissions.extra_seconds + p_seconds
    where public.submissions.id = p_submission_id
      and public.submissions.status = 'in_progress'
    returning *;
$$;
revoke execute on function public.increment_extra_seconds(uuid, integer) from public;
revoke execute on function public.increment_extra_seconds(uuid, integer) from anon;
revoke execute on function public.increment_extra_seconds(uuid, integer) from authenticated;
grant execute on function public.increment_extra_seconds(uuid, integer) to service_role;

-- 4. Serialize per-student membership inserts so two concurrent joins into
--    different sessions cannot both pass the EXISTS probe under READ
--    COMMITTED.
create or replace function public.check_live_membership_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.student_id::text, 0));
  if exists (
    select 1
    from public.live_session_members m
    join public.live_sessions s on s.id = m.session_id
    where m.student_id = new.student_id
      and s.status <> 'ended'
      and m.session_id <> new.session_id
  ) then
    raise exception 'Student is already a member of another live session';
  end if;
  return new;
end;
$$;
