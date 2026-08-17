# Online Paper

A self-service online assessment platform where instructors create and administer assessments to students. Students self-register, join classes, and complete timed or live assessments.

## Roles

**Admin**:
A superuser with full system visibility — manages user accounts, creates and archives classes, views all assessments and scores across the system, and handles account recovery.
_Avoid_: Administrator, sysadmin, root

**Instructor**:
Owns and operates classes — creates assessments, invites students, grades manual responses, releases scores, and controls live assessment sessions. Each class has exactly one instructor.
_Avoid_: Teacher, professor, faculty

**Student**:
Self-registers into the system, joins classes via invitation code or link, takes assessments, and views their own scores after release.
_Avoid_: Pupil, learner, examinee

## Core entities

**Class**:
A grouping of students under one instructor where assessments are administered. Students join classes via an invitation code or link. Classes can be archived by an admin, which hides them from the student list.
_Avoid_: Course, section, subject, room

**Assessment**:
A set of questions administered by an instructor, taken by students in either Timed or Live mode. Has a lifecycle: Draft (instructor editing, invisible to students) → Published (students can see it, but may not yet take it if `accepting_submissions` is off) → Closed (no more submissions). A published assessment can be unpublished (returned to Draft) only if no submissions exist yet. In Timed mode, the instructor sets a per-assessment duration; in Live mode there is no time limit.
_Avoid_: Quiz, exam, test, paper

**Question**:
A single item within an assessment. Each question has a point value assigned by the instructor. Five types: MultipleChoice, FillInTheBlank, TrueOrFalse, Essay, Coding.
_Avoid_: Item, problem, prompt

**Submission**:
A student's attempt at an assessment, tracked through three statuses: In Progress (student has started but not yet submitted; answers auto-save), Submitted (student clicked Submit; triggers auto-grading), and Expired (timer ran out and the system auto-submitted). A student can have multiple submissions for the same assessment via retakes; the latest submitted/expired submission is the authoritative score.
_Avoid_: Attempt, response set, paper

**Time Extension**:
An instructor-granted addition of minutes to a specific student's attempt on a timed assessment. Either extends an In Progress attempt's deadline or re-opens the student's latest finished attempt. Accumulated per attempt as `extra_seconds`; the effective deadline is `started_at + duration_minutes + extra_seconds`.
_Avoid_: Extra time, grace period, deadline adjustment

**Retake**:
A subsequent submission for an already-completed assessment. The instructor controls whether retakes are allowed per assessment. Each retake creates a brand-new submission row while preserving all previous submissions and their answers. An instructor may also force a retake by deleting a specific student's submission.
_Avoid_: Reattempt, redo, second try

**Feedback**:
Written comments left by an instructor on an essay or coding answer during manual grading.
_Avoid_: Comment, note, annotation

**Score**:
The total points a student earned on a submission. Calculated from per-question points. Recalculated if the instructor edits a question after submissions exist. Remains hidden from the student until the instructor explicitly releases scores. Students can copy scores as tab-separated values for pasting into spreadsheets.
_Avoid_: Grade, mark, result

## Submission statuses

**In Progress**:
Student has started the assessment but has not yet submitted. Answers are saved incrementally. Only one In Progress submission exists per student per assessment at a time. The student can resume by navigating back to the assessment page.
_Avoid_: Active, open, ongoing

**Submitted**:
Student clicked the Submit button. Auto-grading runs immediately. Answers cannot be modified after this point, but the instructor may re-open the student's latest finished attempt via a Time Extension. Equivalent to Expired for results display purposes.
_Avoid_: Completed, finished, turned in

**Expired**:
The countdown timer reached zero and the system auto-submitted the student's answers. Auto-grading runs immediately. Treated identically to Submitted for results display. Like Submitted, the instructor may re-open the student's latest finished attempt via a Time Extension.

## Live session

**Live Session**:
A real-time session where the instructor controls question progression for all students simultaneously. Lifecycle: Waiting (created, students can join but see a wait screen) → Active (instructor starts, questions are pushed to all students) → Ended (instructor ends, all live answers are converted into permanent submissions and auto-graded). Only one non-ended session can exist per assessment. Uses Supabase Realtime for broadcast events and presence tracking — the instructor sees how many students are connected and how many have answered each question. A student cannot be in two active sessions at once.
_Avoid_: Synchronous session, guided assessment, real-time quiz

## Assessment modes

**Timed mode**:
Student starts individually. A countdown timer runs from start to expiry based on the per-assessment duration. No pause. Auto-submits on expiry (status becomes Expired). Clock keeps running if the student disconnects. Tab-switch detection counts violations; exceeding the limit auto-submits.
_Avoid_: Self-paced, async

**Live mode**:
Instructor controls question progression for all students via a Live Session. The instructor clicks to advance to the next question; it changes for all students simultaneously. Students have unlimited time per question until the instructor advances. Autosaves work in progress. Late-joining students start at the current question. Instructor can navigate back to previous questions.
_Avoid_: Synchronous, real-time, guided

## Question types

**MultipleChoice**:
Student selects exactly one correct option from several choices. No multi-select ("select all that apply").

**FillInTheBlank**:
Student types a short answer into a blank field. Auto-graded by exact match.
_Avoid_: Completion, cloze, gap-fill

**TrueOrFalse**:
Student selects either True or False. Auto-graded.
_Avoid_: Binary, yes/no

**Essay**:
Student writes a free-text response. Manually graded by the instructor.
_Avoid_: Free response, long answer, written response

**Coding**:
Student writes code in a browser editor. Manually graded by the instructor. No auto-grading or test cases.
_Avoid_: Programming, code challenge

## Proctoring

**Proctoring**:
Tab-switch detection during timed assessments. Each time the student leaves the browser tab, a violation is recorded against their submission. When the violation count reaches the per-assessment limit, the assessment is auto-submitted. Students see a warning banner after each violation.
_Avoid_: Anti-cheat, monitoring, surveillance

**Violation**:
A single instance of the student leaving the browser tab during a timed assessment. Counted per submission, persisted server-side, and visible to the instructor on the submission record.

## Notifications

**Notification**:
An in-app message shown to a student when an assessment is published. Appears as a badge on the notification bell icon in the student dashboard. Clicking the bell opens a dropdown list (newest first). Clicking a notification navigates to the assessment and marks it as read. No email notifications are sent.
_Avoid_: Alert, ping, toast

## Question import

Instructors create questions by pasting a block of formatted plain text. The text uses section headers like `[MultipleChoice]`, `[FillInTheBlank]`, etc. to declare question types, followed by appropriately formatted questions within each section. There is no question bank — instructors re-paste text for each assessment.

## Scoring and results

- Each question carries a point value set by the instructor during creation.
- MultipleChoice, TrueOrFalse, and FillInTheBlank are auto-graded on submission using a pluggable question-type registry. Essay and Coding are manually graded by the instructor.
- When grading manual questions, instructors can leave written feedback on an answer and assign a score. The submission total is recalculated after each manual grade.
- Scores are hidden from students until the instructor releases scores (`scores_released` toggle).
- Correct answers are hidden from students until the instructor activates answer reveal (`answer_reveal_enabled` toggle). These two toggles are independent — scores can be released without revealing correct answers.
- When scores are unreleased, the server strips score data before returning it to the client.
- When released, students see: a score summary, per-question breakdown (their answer vs correct answer, points earned), written feedback on manual answers, and total score.
- If the instructor edits a question after submissions exist, all affected submission scores are recalculated.
- Students may retake an assessment only if the instructor permits it. Each retake creates a new submission; previous submissions are preserved. Students can view their full submission history including scores from past attempts.
- Students can copy scores in tab-separated format for pasting into grading spreadsheets.

## Registration and authentication

- Students self-register with email and password.
- There is no "forgot password" flow. Account recovery is handled by the admin.
- Instructors and admins are created by the admin.

## Profile

**Profile**:
A modal dialog available to all roles where a user updates their first name, last name, and avatar. Triggered by clicking the user's name in the DashboardHeader.

## Constraints

- Each class has exactly one instructor.
- A student cannot participate in two overlapping live sessions.
- An instructor who disconnects mid-session can rejoin and resume a live session.
- A published assessment can only be returned to Draft if no submissions exist yet.
- Only one non-ended live session can exist per assessment at a time.
