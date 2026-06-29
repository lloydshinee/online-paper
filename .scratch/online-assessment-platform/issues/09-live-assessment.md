Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Instructor creates and runs a live assessment session. Students join the session. The instructor controls question progression: "Next" advances all students to the next question simultaneously, "Previous" goes back. All student answers auto-save as they type. Late-joining students start at the current question. If the instructor disconnects, they can rejoin and resume. Students cannot be in two live assessments at the same time — joining a second live session while already in one is rejected.

Uses Supabase Realtime for synchronized state. Each live session has its own Realtime channel. Presence shows which students are connected.

Schema: `live_sessions` table (id, assessment_id FK, instructor_id FK, current_question_index integer default 0, status:text check waiting|active|ended, started_at, ended_at nullable) and `live_answers` table (id, session_id FK, student_id FK, question_id FK, answer_content:jsonb, auto_saved_at).

## Acceptance criteria

- [x] Instructor clicks "Start Live Assessment" on a published live-mode assessment → session created, status `waiting`
- [x] Instructor sees session control panel: current question preview, Next/Previous buttons, student presence list (who's joined)
- [x] Instructor clicks "Start" → status `active`, students see the first question
- [x] Student sees a "Join Live" button on the class page → joins session → sees current question
- [x] Student answers auto-save as they type (debounced, e.g., every 2 seconds or on blur)
- [x] Instructor clicks "Next" → all students advance to next question; previous answers are saved
- [x] Instructor clicks "Previous" → all students return to previous question; their previous answer is restored
- [x] Late-joining student starts at the current question (not question 1)
- [x] Instructor disconnects and reconnects → session state restored, can resume
- [x] Student disconnects and reconnects → rejoins session at current question
- [x] Student in a live session tries to join another live session → rejected with message
- [x] Instructor clicks "End Session" → status `ended`, all student answers finalized as a submission
- [x] Live answers become a regular submission after session ends (flow into same grading pipeline as timed)
- [x] Tests: create session → start → advance questions → answers auto-save → end → verify submission created; late join → starts at current question; dual join → rejected; disconnect instructor → rejoin → session resumes

## Blocked by

- 05-assessment-creation
