import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { loginAsInstructor, loginAsStudent, getCredentials } from './helpers'

/**
 * End-to-end Time Extension flows (PRD): Flow A — the instructor grants
 * +5 minutes mid-exam and the student's live countdown jumps with a banner;
 * Flow B — an expired attempt is re-opened by the instructor (confirm
 * warning) and the student resumes with previous answers, re-submits, and
 * the final score reflects the final answers with manual grades preserved.
 */

config({ path: '.env.local' })

test.describe.configure({ mode: 'serial' })

const STAMP = Date.now()
const FLOW_A_TITLE = `E2E Time Ext A ${STAMP}`
const FLOW_B_TITLE = `E2E Time Ext B ${STAMP}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function createAndPublish(page: Page, title: string) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/create`)
  await page.locator('#title').fill(title)
  await page.locator('#durationMinutes').fill('30')
  await page.getByRole('button', { name: 'Create Assessment' }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)
  const assessmentId = page.url().split('/').pop()!

  await page.getByRole('button', { name: 'Add questions' }).click()
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.locator('textarea').fill(`[MultipleChoice]
What is 2+2?
a) 3
b) 4
c) 5
d) 6
Answer: b
Points: 2

[TrueOrFalse]
The sky is blue.
Answer: True
Points: 1

[Essay]
Describe photosynthesis.
Points: 5`)
  await page.getByRole('button', { name: /Add 3 parsed questions/ }).click()
  await expect(page.getByText('Added 3 questions')).toBeVisible()
  await expect(page.getByText('3 questions — 8 total pts')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Publish assessment').click()
  await expect(page.getByText('Assessment published')).toBeVisible()

  return assessmentId
}

async function openSubmissionsDialog(page: Page, title: string) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await page.getByText(title, { exact: true }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: 'Submissions', exact: true }).click()
  await page.getByRole('button', { name: 'View' }).first().click()
  return page.getByRole('dialog')
}

test('Flow A: mid-exam grant jumps the student countdown and shows a banner', async ({ browser }) => {
  const instructorCtx = await browser.newContext()
  const instructorPage = await instructorCtx.newPage()
  await loginAsInstructor(instructorPage)
  const assessmentId = await createAndPublish(instructorPage, FLOW_A_TITLE)

  const studentCtx = await browser.newContext()
  const studentPage = await studentCtx.newPage()
  await loginAsStudent(studentPage)
  const takeUrl = await studentPage
    .locator('div.group', { hasText: FLOW_A_TITLE })
    .getByRole('link', { name: 'Start Assessment' })
    .getAttribute('href')
  await studentPage.goto(`http://localhost:3111${takeUrl}`)
  await expect(studentPage).toHaveURL(/assessments\/[0-9a-f-]+$/)
  await expect(studentPage.getByRole('radio', { name: /b\)\s*4/ })).toBeVisible()
  await studentPage.getByRole('radio', { name: /b\)\s*4/ }).check()
  await studentPage.getByRole('button', { name: 'Next' }).click()
  await studentPage.getByRole('radio', { name: 'True' }).check()
  await studentPage.getByRole('button', { name: 'Next' }).click()

  // The instructor sees the in-progress attempt with remaining time and grants +5.
  const studentDialog = await openSubmissionsDialog(instructorPage, FLOW_A_TITLE)
  await expect(studentDialog.getByText(/left/)).toBeVisible()
  await studentDialog.getByRole('button', { name: 'Add time' }).click()
  await instructorPage.getByRole('button', { name: '5m', exact: true }).click()
  await instructorPage.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(instructorPage.getByText('Added 5 minutes')).toBeVisible()

  // The student's live page adopts the extended deadline: banner, then a
  // countdown above the original 30-minute duration — no refresh.
  await expect(studentPage.getByText('Instructor added 5 min')).toBeVisible()
  await expect.poll(async () => {
    const text = await studentPage.locator('header .font-mono').innerText()
    const [m, s] = text.split(':').map(Number)
    return m * 60 + s
  }).toBeGreaterThan(30 * 60)

  // The student submits normally and the attempt grades once (MC 2 + TF 1).
  await studentPage.getByRole('button', { name: 'Submit Assessment' }).click()
  await studentPage.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(studentPage.getByText('Scores not yet released')).toBeVisible()

  const { data: row } = await admin
    .from('submissions')
    .select('status, score_total, extra_seconds')
    .eq('assessment_id', assessmentId)
    .single()
  expect(row!.status).toBe('submitted')
  expect(row!.score_total).toBe(3)
  expect(row!.extra_seconds).toBe(5 * 60)

  await instructorCtx.close()
  await studentCtx.close()
})

test('Flow B: instructor re-opens an expired attempt; student resumes and re-submits', async ({ browser }) => {
  const instructorCtx = await browser.newContext()
  const instructorPage = await instructorCtx.newPage()
  await loginAsInstructor(instructorPage)
  const assessmentId = await createAndPublish(instructorPage, FLOW_B_TITLE)

  // The student takes the assessment and answers everything.
  const studentCtx = await browser.newContext()
  const studentPage = await studentCtx.newPage()
  await loginAsStudent(studentPage)
  const takeUrl = await studentPage
    .locator('div.group', { hasText: FLOW_B_TITLE })
    .getByRole('link', { name: 'Start Assessment' })
    .getAttribute('href')
  await studentPage.goto(`http://localhost:3111${takeUrl}`)
  await expect(studentPage).toHaveURL(/assessments\/[0-9a-f-]+$/)
  await studentPage.getByRole('radio', { name: /b\)\s*4/ }).check()
  await studentPage.getByRole('button', { name: 'Next' }).click()
  await studentPage.getByRole('radio', { name: 'True' }).check()
  await studentPage.getByRole('button', { name: 'Next' }).click()
  await studentPage.getByPlaceholder('Write your answer...').fill('Photosynthesis converts light into chemical energy.')
  await studentPage.waitForTimeout(1200) // let the autosave flush

  // The instructor manually grades the essay 4/5 while the attempt is live.
  const creds = getCredentials()
  await instructorPage.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await instructorPage.getByText(FLOW_B_TITLE).click()
  await expect(instructorPage).toHaveURL(/assessments\/[0-9a-f-]+$/)
  await instructorPage.getByRole('button', { name: 'Submissions', exact: true }).click()
  await instructorPage.getByRole('button', { name: 'View' }).first().click()
  await instructorPage.getByRole('button', { name: 'View' }).first().click()
  await expect(instructorPage.getByText('Submission Detail')).toBeVisible()
  await instructorPage.locator('input[type="number"]').fill('4')
  await instructorPage.getByPlaceholder('Feedback (optional)').fill('Well written')
  await expect(instructorPage.getByText('Grade auto-saved')).toBeVisible()
  await instructorPage.getByRole('button', { name: 'Back to submissions' }).click()

  // Expire the attempt server-side by backdating started_at; the student's
  // next visit converges to the finished/results state.
  const { data: submission } = await admin
    .from('submissions')
    .select('id')
    .eq('assessment_id', assessmentId)
    .single()
  const submissionId = submission!.id
  await admin
    .from('submissions')
    .update({ started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })
    .eq('id', submissionId)

  await studentPage.reload()
  await expect(studentPage.getByText('Scores not yet released')).toBeVisible()

  // The instructor re-opens the expired attempt with the confirm warning.
  const studentDialog = await openSubmissionsDialog(instructorPage, FLOW_B_TITLE)
  await expect(studentDialog.getByText('Expired')).toBeVisible()
  await studentDialog.getByRole('button', { name: 'Add time' }).click()
  await expect(instructorPage.getByText('Re-open this finished attempt with extra time.')).toBeVisible()
  await instructorPage.getByRole('button', { name: '5m', exact: true }).click()
  await instructorPage.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(instructorPage.getByText('Re-open this attempt?')).toBeVisible()
  await instructorPage.getByRole('button', { name: 'Re-open and add time' }).click()
  await expect(instructorPage.getByText('Added 5 minutes')).toBeVisible()

  // The student refreshes: resume banner, previous answers intact.
  await studentPage.reload()
  await expect(studentPage.getByText('Instructor added time')).toBeVisible()
  await expect(studentPage.getByRole('radio', { name: /b\)\s*4/ })).toBeChecked()

  // The student changes the MC answer — the final score must reflect the
  // final answers (auto-grades were cleared by the re-open).
  await studentPage.getByRole('radio', { name: /a\)\s*3/ }).check()
  await studentPage.getByRole('button', { name: 'Next' }).click()
  await studentPage.getByRole('button', { name: 'Next' }).click()
  await studentPage.getByRole('button', { name: 'Submit Assessment' }).click()
  await studentPage.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(studentPage.getByText('Scores not yet released')).toBeVisible()

  const { data: finalRow } = await admin
    .from('submissions')
    .select('status, score_total, extra_seconds')
    .eq('id', submissionId)
    .single()
  expect(finalRow!.status).toBe('submitted')
  expect(finalRow!.extra_seconds).toBeGreaterThan(0)
  // MC re-graded to 0 (changed to wrong), TF 1, essay keeps the manual 4.
  expect(finalRow!.score_total).toBe(5)

  const { data: answers } = await admin
    .from('answers')
    .select('score, feedback, is_correct, questions!inner(type)')
    .eq('submission_id', submissionId)
  const typedAnswers = (answers ?? []) as unknown as Array<{
    score: number | null
    feedback: string | null
    is_correct: boolean | null
    questions: { type: string }
  }>
  const essay = typedAnswers.find((a) => a.questions.type === 'Essay')
  expect(essay!.score).toBe(4)
  expect(essay!.feedback).toBe('Well written')
  const mc = typedAnswers.find((a) => a.questions.type === 'MultipleChoice')
  expect(mc!.is_correct).toBe(false)

  await instructorCtx.close()
  await studentCtx.close()
})
