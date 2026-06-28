Status: ready-for-agent

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Three remaining features bundled as a polish layer:

**Notifications**: When an instructor publishes an assessment, all enrolled students receive an in-app notification. A notification bell icon on the student dashboard shows unread count. Clicking opens a dropdown with notification list, clicking a notification navigates to the assessment. No email.

**Retakes**: Instructor can enable retakes per assessment (a toggle in assessment settings). If enabled, a student who already submitted sees a "Retake" button. Starting a retake creates a new submission (previous submission preserved). Retake submissions follow the same grading pipeline as original submissions.

**Admin visibility**: Admin dashboard has a "System Overview" section showing all classes, all assessments per class, and all scores. Admin can click into any class to view its full data (as if they were the instructor). Admin can also impersonate an instructor view.

Schema: `notifications` table (id, user_id FK, assessment_id FK nullable, message:text, read boolean default false, created_at). Add `allow_retakes` boolean to `assessments` table.

## Acceptance criteria

- [ ] Publishing an assessment creates a notification for each enrolled student
- [ ] Notification bell on student dashboard shows unread count badge
- [ ] Click bell → dropdown with notification list (newest first)
- [ ] Click notification → navigate to assessment page, mark as read
- [ ] "Mark all as read" button
- [ ] Instructor toggles "Allow retakes" on an assessment → previously submitted students see "Retake" button
- [ ] Student clicks "Retake" → new submission created (old submission preserved), same timed/live flow
- [ ] If retakes disabled → "Retake" button hidden for all students
- [ ] Admin dashboard: "System Overview" tab shows all classes (collapsible per class → assessments → submission counts)
- [ ] Admin can click into any class → sees full class view (same as instructor sees)
- [ ] Admin can view any student's submission and scores
- [ ] Tests: publish assessment → notification created for each enrolled student; enable retakes → student retakes → new submission appears; admin views all classes → can drill into any class

## Blocked by

- 04-class-management
- 08-score-release
