import { test, expect } from '@playwright/test'
import { loginAsInstructor, loginAsStudent, getCredentials } from './helpers'

/**
 * Live session end-to-end: instructor and student in two separate browser
 * contexts exercising waiting → active → advance → answer → end, plus
 * presence counting and flush-on-end (tickets 07, 08, 09, 12).
 */

test.describe.configure({ mode: 'serial' })

const LIVE_TITLE = `E2E Live ${Date.now()}`

test('live session: waiting → active → advance → end with presence and answer flush', async ({ browser }) => {
  const creds = getCredentials()

  // ---------------- Instructor setup ----------------
  const instructorCtx = await browser.newContext()
  const instructorPage = await instructorCtx.newPage()
  await loginAsInstructor(instructorPage)

  await instructorPage.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/create`)
  await instructorPage.locator('#title').fill(LIVE_TITLE)
  await instructorPage.getByRole('button', { name: 'Live', exact: true }).click()
  await instructorPage.getByRole('button', { name: 'Create Assessment' }).click()
  await expect(instructorPage).toHaveURL(/assessments\/[0-9a-f-]+$/)
  const assessmentUrl = instructorPage.url()
  const assessmentId = assessmentUrl.split('/').pop()!

  // Two MC questions via the paste tab
  await instructorPage.getByRole('button', { name: 'Add questions' }).click()
  await instructorPage.getByRole('button', { name: 'Paste text' }).click()
  await instructorPage.locator('textarea').fill(`[MultipleChoice]
First question?
a) A
b) B
Answer: b
Points: 2

[MultipleChoice]
Second question?
a) C
b) D
Answer: a
Points: 2`)
  await instructorPage.getByRole('button', { name: /Add 2 parsed questions/ }).click()
  await expect(instructorPage.getByText('Added 2 questions')).toBeVisible()

  // Close the add-questions dialog so the tabs are clickable
  await instructorPage.keyboard.press('Escape')

  // Publish
  await instructorPage.getByRole('button', { name: 'Settings' }).click()
  await instructorPage.getByLabel('Publish assessment').click()
  await expect(instructorPage.getByText('Assessment published')).toBeVisible()

  // ---------------- Student opens the live page first (waiting) ----------------
  const studentCtx = await browser.newContext()
  const studentPage = await studentCtx.newPage()
  await loginAsStudent(studentPage)
  await studentPage.goto(`/dashboard/student/classes/${creds.classId}/assessments/${assessmentId}/live`)
  await expect(studentPage.getByText('Waiting for instructor')).toBeVisible({ timeout: 30_000 })

  // ---------------- Instructor opens live page → session auto-created+started ----------------
  await instructorPage.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/${assessmentId}/live`)
  await expect(instructorPage.getByText(/Live Session — /)).toBeVisible({ timeout: 30_000 })

  // The student converges via polling to the session (still waiting: index -1).
  // Instructor begins → first 'next' broadcast.
  await instructorPage.getByRole('button', { name: 'Begin' }).click()

  // Student transitions to Active on the first advance.
  await expect(studentPage.getByText('First question?')).toBeVisible({ timeout: 20_000 })
  await expect(studentPage.getByText('Q1/2')).toBeVisible()

  // The student view must never carry grading fields.
  await expect(studentPage.getByText(/Correct answer/i)).toHaveCount(0)

  // Presence: with 1 student joined, the instructor sees the true count.
  await expect(instructorPage.getByText('1 joined')).toBeVisible({ timeout: 20_000 })
  await expect(instructorPage.getByText('0/1 answered')).toBeVisible({ timeout: 20_000 })

  // Ticket 16 race: the student answers Q1 and the instructor advances
  // IMMEDIATELY — no waiting for the answer count. The student's debounced
  // autosave flushes against the previous question during the advance.
  await studentPage.getByRole('radio', { name: /b\)\s*B/ }).check()
  await instructorPage.getByRole('button', { name: 'Next' }).click()
  await expect(studentPage.getByText('Second question?')).toBeVisible({ timeout: 20_000 })
  await expect(studentPage.getByText('Q2/2')).toBeVisible()
  // The previous question's inputs are gone entirely — no cross-question leakage.
  await expect(studentPage.getByRole('radio', { name: /b\)\s*B/ })).toHaveCount(0)
  // No "Save failed" flash for the legitimate flush save.
  await expect(studentPage.getByText(/Save failed/)).toHaveCount(0)

  // Student answers Q2 and the instructor immediately ends the session.
  await studentPage.getByRole('radio', { name: /a\)\s*C/ }).check()
  await instructorPage.getByRole('button', { name: 'End Session' }).click()

  // Ticket 17: the End button is disabled with visible progress during the
  // end action, and a double-click cannot double-convert.
  await expect(instructorPage.getByRole('button', { name: 'Ending…' })).toBeDisabled({ timeout: 5_000 })
  await instructorPage.getByRole('button', { name: 'Ending…' }).click({ force: true }).catch(() => {})

  await expect(instructorPage.getByText('Session Ended')).toBeVisible({ timeout: 30_000 })

  // Student reaches the Ended screen only after its flush completes.
  await expect(studentPage.getByText('Session Ended')).toBeVisible({ timeout: 30_000 })

  // ---------------- Conversion produced exactly one submission ----------------
  await instructorPage.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/${assessmentId}`)
  await instructorPage.getByRole('button', { name: 'Submissions', exact: true }).click()
  await expect(instructorPage.getByText('1 student')).toBeVisible({ timeout: 30_000 })
  await expect(instructorPage.getByText('1 submission')).toBeVisible({ timeout: 30_000 })

  // Both answers are in the grading view: Q1 (flushed during the immediate
  // advance) and Q2 (flushed during the end grace window).
  await instructorPage.getByRole('button', { name: 'View' }).first().click()
  await instructorPage.getByRole('button', { name: 'View' }).first().click()
  await expect(instructorPage.getByText('Submission Detail')).toBeVisible()
  await expect(instructorPage.getByText(/b\) B/)).toBeVisible()
  await expect(instructorPage.getByText(/a\) C/)).toBeVisible()

  await instructorCtx.close()
  await studentCtx.close()
})
