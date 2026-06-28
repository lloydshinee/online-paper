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
A grouping of students under one instructor where assessments are administered. Students join classes via an invitation code or link.
_Avoid_: Course, section, subject, room

**Assessment**:
A set of questions administered by an instructor, taken by students in either Timed or Live mode. Has a lifecycle: Draft (instructor editing, invisible to students) → Published (students can take it) → Closed (no more submissions).
_Avoid_: Quiz, exam, test, paper

**Question**:
A single item within an assessment. Each question has a point value assigned by the instructor. Five types: MultipleChoice, FillInTheBlank, TrueOrFalse, Essay, Coding.
_Avoid_: Item, problem, prompt

**Submission**:
A student's completed attempt at an assessment. Auto-submitted on timer expiry (Timed mode) or submitted manually. Contains all answers the student provided.
_Avoid_: Attempt, response set, paper

**Feedback**:
Written comments left by an instructor on an essay or coding submission during manual grading.
_Avoid_: Comment, note, annotation

**Score**:
The total points a student earned on a submission. Calculated from per-question points. Recalculated if the instructor edits a question after submissions exist. Remains hidden from the student until the instructor explicitly releases scores.
_Avoid_: Grade, mark, result

## Assessment modes

**Timed mode**:
Student starts individually. A countdown timer runs from start to expiry. No pause. Auto-submits on expiry. Clock keeps running if the student disconnects.
_Avoid_: Self-paced, async

**Live mode**:
Instructor controls question progression for all students. The instructor clicks to advance to the next question; it changes for all students simultaneously. Students have unlimited time per question until the instructor advances. Autosaves work in progress. Late-joining students start at the current question. Instructor can navigate back to previous questions. Preventing overlap: the system prevents a student from being in two live assessments at the same time.
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

## Question import

Instructors create questions by pasting a block of formatted plain text. The text uses section headers like `[MultipleChoice]`, `[FillInTheBlank]`, etc. to declare question types, followed by appropriately formatted questions within each section. There is no question bank — instructors re-paste text for each assessment.

## Scoring and results

- Each question carries a point value set by the instructor during creation.
- MultipleChoice, TrueOrFalse, and FillInTheBlank are auto-graded on submission.
- Essay and Coding are manually graded by the instructor.
- When grading manual questions, instructors can leave written feedback on a submission.
- Scores are hidden from students until the instructor releases all scores.
- Correct answers are hidden from students until the instructor activates "show answers."
- When released, students see: per-question breakdown (their answer vs correct answer, points earned), written feedback, and total score. Scores are displayed in a table format suitable for copying into grading spreadsheets.
- If the instructor edits a question after submissions exist, all scores are recalculated.
- Students may retake an assessment only if the instructor permits it.
- Students receive in-app notifications when an assessment is published. No email notifications.

## Registration and authentication

- Students self-register with email and password.
- There is no "forgot password" flow. Account recovery is handled by the admin.
- Instructors and admins are created by the admin.

## Constraints

- Each class has exactly one instructor.
- A student cannot participate in two overlapping live assessments.
- An instructor who disconnects mid-session can rejoin and resume a live assessment.
