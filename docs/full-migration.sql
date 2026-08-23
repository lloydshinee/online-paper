-- =============================================================================
-- Full migration for online-paper — self-hosted Supabase
-- Run this as a single migration on a fresh Supabase instance.
-- This is a standalone script that also patches the dev/data.sql storage issue.
-- =============================================================================

-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pgjwt" with schema extensions;

-- 2. Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('instructor', 'student');
create type public.assessment_mode as enum ('live', 'timed');
create type public.assessment_state as enum ('draft', 'active', 'closed');

-- 3. Tables
-- ---------------------------------------------------------------------------

-- accounts (legacy, kept for reference; users is the active table)
create table public.accounts (
  id         uuid not null references auth.users(id) on delete cascade,
  email      text not null unique,
  role       public.app_role not null,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);
alter table public.accounts enable row level security;

-- users (current)
create table public.users (
  id         uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null check (role = any (array['admin', 'instructor', 'student'])),
  name       text,
  created_at timestamptz not null default now(),
  primary key (id)
);
alter table public.users enable row level security;

create index users_email_idx on public.users (email);
create index users_role_idx on public.users (role);

-- classes
create table public.classes (
  id                uuid not null default gen_random_uuid(),
  instructor_id     uuid not null references public.users(id) on delete cascade,
  name              text not null,
  join_code         text unique,
  enrollment_closed boolean not null default false,
  archived          boolean default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (id)
);
alter table public.classes enable row level security;

create index idx_classes_instructor_id on public.classes (instructor_id);
create index idx_classes_join_code on public.classes (join_code);

-- class_enrollments
create table public.class_enrollments (
  id          uuid not null default gen_random_uuid(),
  student_id  uuid not null references public.users(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (id),
  unique (student_id, class_id)
);
alter table public.class_enrollments enable row level security;

create index idx_class_enrollments_student_id on public.class_enrollments (student_id);
create index idx_class_enrollments_class_id on public.class_enrollments (class_id);

-- assessments
create table public.assessments (
  id                         uuid not null default gen_random_uuid(),
  class_id                   uuid not null references public.classes(id) on delete cascade,
  title                      text not null,
  mode                       public.assessment_mode not null default 'timed'::public.assessment_mode,
  state                      public.assessment_state not null default 'draft'::public.assessment_state,
  duration_minutes           integer,
  availability_start         timestamptz,
  availability_end           timestamptz,
  shuffle_enabled            boolean not null default true,
  passing_score              integer,
  proctoring_violations_allowed integer not null default 3,
  answer_reveal_enabled      boolean not null default false,
  scores_released            boolean default false,
  accepting_submissions      boolean default true,
  retakes_allowed            boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  primary key (id)
);
alter table public.assessments enable row level security;

create index idx_assessments_class_id on public.assessments (class_id);
create index idx_assessments_state on public.assessments (state);

-- questions
create table public.questions (
  id            uuid not null default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  type          text not null check (type = any (array['MultipleChoice', 'FillInTheBlank', 'TrueOrFalse', 'Essay', 'Coding'])),
  content       jsonb not null default '{}'::jsonb,
  points        integer not null default 1,
  order_index   integer not null default 0,
  created_at    timestamptz default now(),
  primary key (id)
);
alter table public.questions enable row level security;

-- submissions
create table public.submissions (
  id            uuid not null default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id    uuid not null references public.users(id) on delete cascade,
  started_at    timestamptz default now(),
  submitted_at  timestamptz,
  status        text not null default 'in_progress' check (status = any (array['in_progress', 'submitted', 'expired'])),
  score_total   integer,
  violations    integer not null default 0,
  extra_seconds integer not null default 0,
  created_at    timestamptz default now(),
  primary key (id)
);
alter table public.submissions enable row level security;

-- only one in_progress submission per student per assessment
create unique index idx_one_in_progress_per_student on public.submissions (student_id, assessment_id)
  where (status = 'in_progress'::text);

-- answers
create table public.answers (
  id             uuid not null default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  answer_content jsonb not null default '{}'::jsonb,
  score          integer,
  is_correct     boolean,
  feedback       text,
  updated_at     timestamptz default now(),
  primary key (id),
  unique (submission_id, question_id)
);
alter table public.answers enable row level security;

-- live_sessions
create table public.live_sessions (
  id                      uuid not null default gen_random_uuid(),
  assessment_id           uuid not null unique references public.assessments(id) on delete cascade,
  instructor_id           uuid not null references public.users(id) on delete cascade,
  current_question_index  integer not null default 0,
  status                  text not null default 'waiting' check (status = any (array['waiting', 'active', 'ended'])),
  started_at              timestamptz,
  ended_at                timestamptz,
  created_at              timestamptz not null default now(),
  -- Ticket 16: previous index + advance timestamp so the write gate can
  -- tolerate a flush of the immediately previous question for a short window.
  prev_question_index     integer,
  advanced_at             timestamptz,
  -- Ticket 21 (F1/F2): per-question departure records
  -- [{index, departed_at}]. The write gate accepts a save for question index
  -- i when i is current or has an unexpired departure (now - departed_at <=
  -- LIVE_ADVANCE_FLUSH_WINDOW_MS). Each departed question carries its own
  -- window from its own departure, so rapid advances — or an advance chain
  -- discovered late by polling — never shorten a question's flush window.
  -- Truncated to non-expired entries on every advance.
  flush_departures        jsonb,
  primary key (id)
);
alter table public.live_sessions enable row level security;

-- live_answers
create table public.live_answers (
  id             uuid not null default gen_random_uuid(),
  session_id     uuid not null references public.live_sessions(id) on delete cascade,
  student_id     uuid not null references public.users(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  answer_content jsonb not null default '{}'::jsonb,
  auto_saved_at  timestamptz not null default now(),
  primary key (id),
  unique (session_id, student_id, question_id)
);
alter table public.live_answers enable row level security;

-- notifications
create table public.notifications (
  id            uuid not null default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  message       text not null,
  read          boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (id)
);
alter table public.notifications enable row level security;

-- live_session_members
-- Explicit live session participation: a student may be a member of only one
-- non-ended session at a time (enforced by a trigger below).
create table public.live_session_members (
  id          uuid not null default gen_random_uuid(),
  session_id  uuid not null references public.live_sessions(id) on delete cascade,
  student_id  uuid not null references public.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (id),
  unique (session_id, student_id)
);
alter table public.live_session_members enable row level security;

create index live_session_members_student_idx on public.live_session_members (student_id);

-- 4. Helper functions
-- ---------------------------------------------------------------------------

-- Atomically increment a submission's violation counter (proctoring).
-- Returns the updated row only when the caller owns the submission and it is
-- still in progress; otherwise returns no rows.
--
-- p_student_id is the server-verified caller (the Next.js action passes
-- auth.userId); it is NOT trusted from the wire. EXECUTE is revoked from the
-- default PUBLIC grant so only the service role — the sole caller, via the
-- submission service — can invoke this function. A NULL p_student_id can
-- never bypass the ownership check.
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
  -- Ownership binding: only the submission's own student can record violations.
  -- IS DISTINCT FROM keeps a NULL argument from silently passing the check.
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

-- Atomically add instructor-granted time to an IN PROGRESS attempt.
-- Returns the updated row; returns no rows when the submission is not
-- currently in progress (finished or concurrently submitted/expired), which
-- the caller surfaces as an explicit error instead of a silent mis-grant.
-- Service-role only: the grant path is instructor-driven through server code.
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

-- A student cannot participate in two overlapping (non-ended) live sessions.
-- The advisory lock serializes concurrent inserts per student: without it,
-- two simultaneous joins into different sessions both pass the EXISTS probe
-- under READ COMMITTED and both insert (the unique constraint spans only
-- one session).
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

create trigger trg_check_live_membership_overlap
  before insert on public.live_session_members
  for each row execute function public.check_live_membership_overlap();

-- Auto-generate a 6-char join code
create or replace function public.generate_join_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- Trigger function: set join_code on insert if null
create or replace function public.set_join_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.join_code is null then
    loop
      new.join_code := public.generate_join_code();
      begin
        perform 1 from public.classes where join_code = new.join_code;
        if not found then
          exit;
        end if;
      end;
    end loop;
  end if;
  return new;
end;
$$;

-- Trigger function: auto-update updated_at
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Check if auth.uid() is the instructor of a class
create or replace function public.is_instructor_of_class(class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    join public.users u on u.id = c.instructor_id
    where c.id = class_id and u.id = auth.uid() and u.role = 'instructor'
  );
$$;

-- Trigger function: auto-create a public.users row on auth.users insert
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_role text;
  user_name text;
begin
  user_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  user_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  insert into public.users (id, email, name, role)
  values (new.id, new.email, user_name, user_role);
  return new;
end;
$$;

-- 5. Triggers
-- ---------------------------------------------------------------------------

create trigger trigger_set_join_code
  before insert on public.classes
  for each row execute function public.set_join_code();

create trigger update_assessments_updated_at
  before update on public.assessments
  for each row execute function public.update_updated_at_column();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 6. Row-Level Security policies
-- ---------------------------------------------------------------------------

-- users
create policy "Admins manage all users" on public.users
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin')
  with check ((select role from public.users where id = auth.uid()) = 'admin');

create policy "Users can read own record" on public.users
  for select
  using (auth.uid() = id);

-- accounts (legacy)
create policy "Users can view their own account" on public.accounts
  for select
  using (auth.uid() = id);

create policy "Users can update their own account" on public.accounts
  for update
  using (auth.uid() = id);

-- classes
create policy "Admins can manage all classes" on public.classes
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors can create their own classes" on public.classes
  for insert
  with check (auth.uid() = instructor_id);

create policy "Instructors can view their own classes" on public.classes
  for select
  using (auth.uid() = instructor_id);

create policy "Instructors can update their own classes" on public.classes
  for update
  using (auth.uid() = instructor_id);

create policy "Students can view classes they are enrolled in" on public.classes
  for select
  using (exists (
    select 1 from public.class_enrollments
    where class_id = classes.id and student_id = auth.uid()
  ));

-- class_enrollments
create policy "Admins can manage all enrollments" on public.class_enrollments
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors can view enrollments in their classes" on public.class_enrollments
  for select
  using (is_instructor_of_class(class_id));

create policy "Instructors can remove students from their classes" on public.class_enrollments
  for delete
  using (exists (
    select 1 from public.classes
    where id = class_enrollments.class_id and instructor_id = auth.uid()
  ));

create policy "Students can enroll themselves" on public.class_enrollments
  for insert
  with check (auth.uid() = student_id);

create policy "Students can view their own enrollments" on public.class_enrollments
  for select
  using (auth.uid() = student_id);

-- assessments
create policy "Admins can manage all assessments" on public.assessments
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors can manage their own assessments" on public.assessments
  for all
  using (exists (
    select 1 from public.classes
    where id = assessments.class_id and instructor_id = auth.uid()
  ));

create policy "Instructors can create assessments in their classes" on public.assessments
  for insert
  with check (exists (
    select 1 from public.classes
    where id = assessments.class_id and instructor_id = auth.uid()
  ));

create policy "Instructors can update assessments in their classes" on public.assessments
  for update
  using (exists (
    select 1 from public.classes
    where id = assessments.class_id and instructor_id = auth.uid()
  ));

create policy "Instructors can view assessments in their classes" on public.assessments
  for select
  using (exists (
    select 1 from public.classes
    where id = assessments.class_id and instructor_id = auth.uid()
  ));

create policy "Students can view active/closed assessments in enrolled classes" on public.assessments
  for select
  using (
    state = any (array['active'::assessment_state, 'closed'::assessment_state])
    and exists (
      select 1 from public.class_enrollments
      where class_id = assessments.class_id and student_id = auth.uid()
    )
  );

create policy "Students can view published assessments for their classes" on public.assessments
  for select
  using (
    exists (
      select 1 from public.class_enrollments
      where class_id = assessments.class_id and student_id = auth.uid()
    )
    and state = 'active'::assessment_state
  );

-- questions
create policy "Admins can manage all questions" on public.questions
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors can manage questions for their assessments" on public.questions
  for all
  using (exists (
    select 1 from public.assessments a
    join public.classes c on c.id = a.class_id
    where a.id = questions.assessment_id and c.instructor_id = auth.uid()
  ));

-- Students have NO direct policies on questions: `content` jsonb carries the
-- answer key (correctAnswer / correctIndex), and a row-level policy can only
-- filter rows, never columns. Students receive questions exclusively through
-- server actions that sanitize before responding. Direct PostgREST reads by
-- students are denied by default; any future client-side need must go
-- through a sanitized view or server action instead.

-- submissions
create policy "Admins view all submissions" on public.submissions
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors view submissions for their class assessments" on public.submissions
  for select
  using (exists (
    select 1 from public.assessments a
    join public.classes c on c.id = a.class_id
    where a.id = submissions.assessment_id and c.instructor_id = auth.uid()
  ));

-- Students have NO direct policies on submissions: rows carry score_total,
-- violations, and extra_seconds, which must stay hidden until the instructor
-- releases scores. All student reads and writes flow through server actions
-- on the service-role client; direct PostgREST reads by students are denied
-- by default (same rationale as questions / live_session_members).

-- answers
create policy "Admins view all answers" on public.answers
  for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Instructors view answers for their classes" on public.answers
  for select
  using (exists (
    select 1 from public.submissions s
    join public.assessments a on a.id = s.assessment_id
    join public.classes c on c.id = a.class_id
    where s.id = answers.submission_id and c.instructor_id = auth.uid()
  ));

-- Students have NO direct policies on answers: rows carry score, is_correct,
-- and feedback, which stay hidden until the instructor releases scores (and,
-- for per-question data, enables answer reveal). All student reads and
-- writes flow through server actions on the service-role client; direct
-- PostgREST reads by students are denied by default.

-- live_sessions
create policy "Admins manage all live_sessions" on public.live_sessions
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin')
  with check ((select role from public.users where id = auth.uid()) = 'admin');

create policy "instructor_manage_live_sessions" on public.live_sessions
  for all
  using (
    instructor_id = (select id from public.users where id = auth.uid())
    and (select role from public.users where id = auth.uid()) = 'instructor'
  );

create policy "student_read_live_sessions" on public.live_sessions
  for select
  using (exists (
    select 1 from public.assessments a
    join public.class_enrollments ce on ce.class_id = a.class_id
    where a.id = live_sessions.assessment_id
    and ce.student_id = (select id from public.users where id = auth.uid())
  ));

-- live_answers
create policy "Admins manage all live_answers" on public.live_answers
  for all
  using ((select role from public.users where id = auth.uid()) = 'admin')
  with check ((select role from public.users where id = auth.uid()) = 'admin');

create policy "instructor_read_live_answers" on public.live_answers
  for select
  using (exists (
    select 1 from public.live_sessions ls
    where ls.id = live_answers.session_id
    and ls.instructor_id = (select id from public.users where id = auth.uid())
  ));

create policy "student_own_live_answers" on public.live_answers
  for all
  using (
    student_id = (select id from public.users where id = auth.uid())
    and (select role from public.users where id = auth.uid()) = 'student'
  );

-- notifications
create policy "Users can view their own notifications" on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update their own notifications" on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 7. Realtime publication
-- ---------------------------------------------------------------------------
-- The supabase_realtime publication is created by Supabase by default.
-- Add tables that need realtime updates (broadcast Presence is automatic).

alter publication supabase_realtime add table public.live_sessions;
alter publication supabase_realtime add table public.live_answers;
alter publication supabase_realtime add table public.notifications;

-- =============================================================================
-- Done.
-- =============================================================================
