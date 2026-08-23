#!/usr/bin/env bash
# Remove automated-test fixtures from the local Supabase database.
#
# Scope is deliberately narrow: only accounts under the example.com domain
# with the test- or e2e- prefixes are touched — never a real account. Their
# classes, assessments, enrollments, submissions, answers, live sessions,
# memberships, and notifications go with them.
#
# Runs automatically after a passing `npm test` (posttest) and can be invoked
# anytime with `npm run db:clean`. Override the container name with
# SUPABASE_DB_CONTAINER when pointing at another instance.

set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-test-online-db}"

docker exec -i "$CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

CREATE TEMP TABLE doomed ON COMMIT DROP AS
SELECT id FROM public.users
WHERE email LIKE 'test-%@example.com' OR email LIKE 'e2e-%@example.com';

CREATE TEMP TABLE doomed_classes ON COMMIT DROP AS
SELECT id FROM classes WHERE instructor_id IN (SELECT id FROM doomed);

DO $$
DECLARE
  users int;
  classes int;
  stragglers int;
BEGIN
  SELECT count(*) INTO users FROM doomed;
  SELECT count(*) INTO classes FROM doomed_classes;
  SELECT count(*) INTO stragglers FROM class_enrollments
    WHERE class_id IN (SELECT id FROM doomed_classes)
      AND student_id NOT IN (SELECT id FROM doomed);

  IF users = 0 AND classes = 0 THEN
    RAISE NOTICE 'Nothing to clean — no test fixtures present.';
    RETURN;
  END IF;

  RAISE NOTICE 'Cleaning % test user(s), % test class(es)...', users, classes;
  IF stragglers > 0 THEN
    RAISE WARNING '% non-test enrollment(s) inside test classes will be removed with them.', stragglers;
  END IF;
END $$;

DELETE FROM answers WHERE submission_id IN (
  SELECT id FROM submissions WHERE student_id IN (SELECT id FROM doomed)
     OR assessment_id IN (SELECT id FROM assessments WHERE class_id IN (SELECT id FROM doomed_classes)));
DELETE FROM notifications WHERE user_id IN (SELECT id FROM doomed)
   OR assessment_id IN (SELECT id FROM assessments WHERE class_id IN (SELECT id FROM doomed_classes));
DELETE FROM live_answers WHERE student_id IN (SELECT id FROM doomed);
DELETE FROM live_session_members WHERE student_id IN (SELECT id FROM doomed);
DELETE FROM live_sessions WHERE instructor_id IN (SELECT id FROM doomed);
DELETE FROM submissions
WHERE student_id IN (SELECT id FROM doomed)
   OR assessment_id IN (SELECT id FROM assessments WHERE class_id IN (SELECT id FROM doomed_classes));
DELETE FROM assessments WHERE class_id IN (SELECT id FROM doomed_classes);
DELETE FROM class_enrollments
WHERE student_id IN (SELECT id FROM doomed) OR class_id IN (SELECT id FROM doomed_classes);
DELETE FROM classes WHERE id IN (SELECT id FROM doomed_classes);
DELETE FROM public.users WHERE id IN (SELECT id FROM doomed);
DELETE FROM auth.users WHERE email LIKE 'test-%@example.com' OR email LIKE 'e2e-%@example.com';

COMMIT;
SQL

echo "Remaining test rows:"
docker exec "$CONTAINER" psql -U supabase_admin -d postgres -tAc \
  "select 'users=' || (select count(*) from public.users where email like '%@example.com') || \
          ' classes=' || (select count(*) from classes where name ilike 'e2e %' or name ilike 'test%') || \
          ' total_real_users=' || (select count(*) from public.users);"
