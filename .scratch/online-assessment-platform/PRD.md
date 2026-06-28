# Online Assessment Platform — PRD

**Status:** ready-for-agent

## Problem Statement

Instructors need a way to create and administer online assessments without the friction of typing questions one-by-one. Existing tools either require manual question entry, lack live classroom-style assessment modes, or produce scores in formats that don't easily transfer to grading spreadsheets. Students need a single place to take assessments, see results, and track scores across multiple classes. Admins need visibility and control over the entire system.

## Solution

A self-service online assessment platform with three roles. Instructors paste formatted text to bulk-create questions, choose between Timed (individual countdown) or Live (instructor-controlled progression) assessment modes, manually grade essays and coding, and release scores in a table format suitable for grading sheets. Students self-register, join classes via invitation code, take assessments, and review their results with per-question breakdowns and feedback. Admins manage accounts and have system-wide visibility.

## User Stories

### Registration & Authentication
1. As a student, I want to register with email and password, so that I can access the platform.
2. As a student, I want to log in with my email and password, so that I can access my dashboard.
3. As an admin, I want to create instructor and admin accounts, so that the platform has operators.
4. As an admin, I want to manage all user accounts (edit, deactivate, reset password), so that I control access.
5. As an admin, I want to handle account recovery (reset passwords for users), so that users regain access when locked out.

### Class Management
6. As an instructor, I want to create a class, so that I can organize my students and assessments.
7. As an instructor, I want my class to generate an invitation code or link, so that students can join.
8. As a student, I want to join a class via invitation code or link, so that I can participate in assessments.
9. As an admin, I want to create and archive classes, so that I manage the platform's class catalog.
10. As a student, I want to see my enrolled classes on my dashboard, so that I can navigate to my assessments.
11. As a student, I want to see a join class button (enter code) on my dashboard, so that I can enroll in new classes.

### Assessment Creation
12. As an instructor, I want to create an assessment by pasting a block of formatted plain text with section headers like `[MultipleChoice]`, `[FillInTheBlank]`, `[TrueOrFalse]`, `[Essay]`, `[Coding]`, so that I don't have to type questions one by one.
13. As an instructor, I want to set a point value for each question individually, so that different questions have appropriate weight.
14. As an instructor, I want to choose between Timed and Live mode when creating an assessment, so that it fits my teaching style.
15. As an instructor, I want to set a time limit (in minutes) for a timed assessment, so that students complete it within constraints.
16. As an instructor, I want to save an assessment as a Draft, so that I can continue editing before students see it.
17. As an instructor, I want to publish an assessment, so that students can take it (and get in-app notifications).
18. As an instructor, I want to close an assessment, so that no more submissions are accepted.
19. As an instructor, I want to edit an assessment after students have submitted, and have all scores automatically recalculate, so that I can fix errors.

### Timed Assessment — Student Experience
20. As a student, I want to start a timed assessment, so that I can complete it within the given time limit.
21. As a student, I want to see a countdown timer during the assessment, so that I know how much time remains.
22. As a student, I want my assessment to auto-submit when the timer expires, so that my completed work is saved.
23. As a student, I want the clock to keep running if I disconnect, so that the time limit is enforced fairly.
24. As a student, I want to manually submit before the timer expires, so that I can finish early.

### Live Assessment — Student Experience
25. As a student, I want to join a live assessment session, so that I can answer questions as the instructor advances them.
26. As a student, I want my current answer to auto-save, so that I don't lose work when the instructor moves to the next question.
27. As a student, I want to join a live assessment already in progress and start at the current question, so that I'm not locked out for being late.
28. As a student, I want to be prevented from joining a second live assessment that overlaps with one I'm already in, so that I focus on one session at a time.

### Live Assessment — Instructor Experience
29. As an instructor, I want to start a live assessment session, so that students can join.
30. As an instructor, I want to click a "Next" button to advance all students to the next question simultaneously, so that I control the pace.
31. As an instructor, I want to click a "Previous" button to return all students to a previous question, so that we can revisit it.
32. As an instructor, I want to see which students have joined the live session, so that I know who is present.
33. As an instructor, I want to reconnect and resume a live session if my internet drops, so that the session isn't lost.

### Grading & Results
34. As a student, I want my multiple-choice, true/false, and fill-in-the-blank answers to be auto-graded on submission, so that I get immediate results for objective questions.
35. As an instructor, I want to manually grade essay submissions with a score and written feedback, so that I evaluate extended responses.
36. As an instructor, I want to manually grade coding submissions with a score and written feedback, so that I evaluate code quality.
37. As an instructor, I want to release all scores at once (per assessment), so that students see their results.
38. As an instructor, I want to activate "show answers" separately, so that I can control when students see correct answers.
39. As a student, I want to view my per-question breakdown after scores are released (my answer vs. correct answer, points earned), so that I understand where I succeeded and struggled.
40. As a student, I want to read written feedback on my essay and coding submissions, so that I know how to improve.
41. As an instructor, I want scores displayed in a table format, so that I can copy them into my grading spreadsheets.
42. As a student, I want to see my scores in a table format, so that I can copy them for my own records.

### Dashboard & Notifications
43. As a student, I want to see upcoming/pending assessments per class on my dashboard, so that I know what's due.
44. As a student, I want to view my past scores and grade history (across all classes), so that I can track my progress.
45. As a student, I want to receive in-app notifications when an instructor publishes an assessment in my class, so that I know it's available.
46. As an instructor, I want to enable or disable retakes per assessment, so that I control reattempt policy.
47. As a student, I want to retake an assessment if the instructor has permitted it, so that I can improve my score.

### Admin
48. As an admin, I want to view all assessments and scores across all classes, so that I have system-wide visibility.
49. As an admin, I want to view any instructor's class data, so that I can assist with issues.
50. As an admin, I want to impersonate an instructor (view the platform as they see it), so that I can diagnose problems.

## Implementation Decisions

### Database
- **Self-hosted Supabase** (Postgres) running locally at `~/Documents/supabase/test-online/`. Provides Postgres, Auth (GoTrue), REST API (PostgREST), Realtime (WebSockets), and Storage. The Supabase MCP server is available at `http://localhost:8000/mcp` for database introspection.

### UI Framework
- **shadcn/ui** initialized with the default preset (`npx shadcn@latest init`). Components added via CLI as needed. Follows all shadcn Critical Rules: `FieldGroup` for forms, `gap-*` not `space-y-*`, semantic color tokens, `cn()` for conditional classes, `data-icon` for button icons.
- **Frontend design**: Distinctive, polished aesthetic — not generic AI-looking UI. Bold typography pairing (distinctive display + refined body), intentional color palette with dominant colors and sharp accents, creative spatial composition, subtle motion on high-impact moments. Avoid Inter/Roboto/Arial — use characterful fonts. Avoid purple-on-white gradient cliches.

### Authentication
- **Supabase Auth (GoTrue)** for email + password authentication. Email auto-confirm enabled (no verification emails). No OAuth, no forgot-password flow. Admin handles account recovery by resetting passwords via Supabase Admin API. Sessions managed by Supabase Auth cookies.

### Question Import Parser
- A **custom plain-text parser** that reads section headers (`[MultipleChoice]`, `[FillInTheBlank]`, `[TrueOrFalse]`, `[Essay]`, `[Coding]`) and parses each section's questions according to sub-rules:
  - `[MultipleChoice]`: Each question block has a stem followed by options labeled `a)` `b)` `c)` `d)` and a correct answer marker.
  - `[FillInTheBlank]`: Each stanza has a sentence with `______` marking the blank and a delimited answer.
  - `[TrueOrFalse]`: Each item has a statement and a `True` or `False` answer.
  - `[Essay]`: Each item is a prompt. No answer, since grading is manual.
  - `[Coding]`: Each item is a problem statement. No test cases or auto-grading; manual only.

### Assessment Modes — Two Separate Modules
Per ADR-0001, Timed and Live modes are distinct modules, not a single configurable path. Each has its own:
- **Timed**: Per-student timer state, auto-submit on expiry, no instructor involvement after publish.
- **Live**: Instructor-controlled WebSocket/similar channel, synchronized question state across all joined students, join-in-progress, instructor reconnect.

### Real-time (Live Mode)
- **Supabase Realtime** for live question advancement. Instructor's "Next"/"Previous" actions broadcast to all connected students via Realtime channels. Each live session gets its own channel. The same Realtime infrastructure handles presence (showing which students joined).

### Scoring Engine
- Per-question points summed into total score. Auto-graded types (MC, TF, Fill) scored on submission. Manual types (Essay, Coding) scored when instructor grades.
- Score recalculation: when an instructor edits a published assessment's questions or points, all existing submissions' scores are recomputed.
- Scores are hidden from students until the instructor explicitly releases them.

### Score Table Output
- Scores rendered as an HTML `<table>` that can be selected and copied (Ctrl+C) for pasting into spreadsheet applications (Excel, Google Sheets, grading sheets).

### Notification System
- **In-app only.** No email infrastructure. A notification bell/icon on the student dashboard shows unread notifications. Publishing an assessment creates a notification for all enrolled students in that class.

### Constraints Enforced by the System
- Each class has exactly one instructor.
- A student cannot be in two live assessments simultaneously (checked at join time).
- Only the instructor who owns a class can modify its assessments.
- Only the admin can create instructor/admin accounts.

## Testing Decisions

### Seam: HTTP endpoints (server actions / API routes)
The single testing seam is at the HTTP layer. Tests call server actions or API routes with standard HTTP requests and assert on responses and database state. This tests the full stack from request to database without mocking internals.

### Swappable database backend
The database layer exposes a repository interface. Tests use a local Supabase instance (or a test schema) isolated per test run. No mocking of database calls. Supabase Auth and Realtime are mocked at the HTTP boundary for test speed.

### Test structure
- **Test directory**: `__tests__/` at the repo root or per-feature `__tests__/` directories.
- **Test framework**: Vitest (integrates cleanly with the project's setup).
- **Test data**: Each test seeds the minimum data needed, exercises the endpoint, and asserts on both the HTTP response and the resulting database rows.

### What makes a good test
- Tests exercise external behavior: what a user or client would see (HTTP status, response body, side effects in the database).
- Tests do not assert on internal implementation: no testing private functions, middleware chains, or Next.js internals.
- One test per user story or behavioral scenario. Name tests after the behavior: "publishing an assessment notifies enrolled students."

## Out of Scope

- OAuth / social login
- Email notifications or email infrastructure
- Forgot password / self-service password reset
- Question bank / question reuse across assessments
- Matching, ordering, hotspot, file upload, or short-answer question types
- Multi-select multiple choice ("select all that apply")
- Timed questions within live mode (live mode has unlimited time per question)
- Pausing the timer in timed assessments
- Student self-service retake requests (instructor initiates)
- Class sections, multiple instructors per class, or teaching assistants
- Date-range scheduling for assessment availability (publish = available, close = unavailable)
- Automated grading for coding questions (no test cases or judge)
- Mobile app
- Multi-language support

## Further Notes

- The question import parser format needs a precise spec (the exact syntax for each section type) before development starts. This PRD defines the concept; a follow-up issue should nail down the grammar.
- Real-time for live assessments is the riskiest technical component. A prototype spike is recommended before committing to a specific WebSocket library or approach.
- The score table output should match the column layout of common grading spreadsheets. Coordinate with the instructor on the exact columns expected.
