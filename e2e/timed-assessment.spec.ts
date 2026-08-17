import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAsInstructor, loginAsStudent, getCredentials } from './helpers'

/**
 * End-to-end timed assessment flow: create → publish → take → grade →
 * release scores → reveal answers. Covers the score-stripping and
 * answer-reveal gating behavior from tickets 01 and 05.
 */

test.describe.configure({ mode: 'serial' })

const SCORE_RELEASE_TITLE = `E2E Timed ${Date.now()}`
const EXTENSION_TITLE = `E2E Timed Extension ${Date.now()}`
let scoreReleaseAssessmentId = ''
let extensionAssessmentId = ''

async function createAndPublish(page: Page, opts: { title: string; durationMinutes: string; questionText: string }) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/create`)
  await page.locator('#title').fill(opts.title)
  await page.locator('#durationMinutes').fill(opts.durationMinutes)
  await page.getByRole('button', { name: 'Create Assessment' }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)

  // Add questions via the paste tab
  await page.getByRole('button', { name: 'Add questions' }).click()
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.locator('textarea').fill(opts.questionText)
  await page.getByRole('button', { name: /Add \d+ parsed question/ }).click()

  // Close the add-questions dialog so the tabs are clickable
  await page.keyboard.press('Escape')

  // Publish via the settings tab
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Publish assessment').click()
  await expect(page.getByText('Assessment published')).toBeVisible()
}

async function openAssessment(page: Page, title: string) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await page.getByText(title).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)
}

async function openStudentAttemptsDialog(page: Page) {
  await page.getByRole('button', { name: 'Submissions', exact: true }).click()
  await page.getByRole('button', { name: 'View' }).first().click()
}

async function grantFiveMinutesToFirstAttempt(page: Page) {
  await page.getByRole('button', { name: 'Add time' }).first().click()
  await page.getByRole('button', { name: '5m', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
}

async function closeContext(context: BrowserContext) {
  await context.close()
}

test('instructor creates and publishes a timed assessment', async ({ page }) => {
  await loginAsInstructor(page)
  await createAndPublish(page, {
    title: SCORE_RELEASE_TITLE,
    durationMinutes: '30',
    questionText: `[MultipleChoice]
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
Points: 5`,
  })
  scoreReleaseAssessmentId = page.url().split('/').pop()!
})

test('student takes the assessment and submits', async ({ page }) => {
  await loginAsStudent(page)
  const card = page.locator('div.group', { hasText: SCORE_RELEASE_TITLE })
  await card.getByRole('link', { name: 'Start Assessment' }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)

  // The take page must never render grading fields — no "Correct answer" UI.
  await expect(page.getByText(/Correct answer/i).first()).toHaveCount(0)

  // MC: choose b) 4 (correct)
  await page.getByRole('radio', { name: /b\)\s*4/ }).check()

  // Next → TF is on Q2; navigate to essay on Q3
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('radio', { name: 'True' }).check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByPlaceholder('Write your answer...').fill('Photosynthesis converts light into chemical energy.')

  await page.getByRole('button', { name: 'Submit Assessment' }).click()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()

  // Scores are unreleased → hidden view
  await expect(page.getByText('Scores not yet released')).toBeVisible()
})

test('instructor grades the essay and releases scores', async ({ page }) => {
  await loginAsInstructor(page)
  await openAssessment(page, SCORE_RELEASE_TITLE)

  await page.getByRole('button', { name: 'Submissions', exact: true }).click()
  await expect(page.getByText('1 student')).toBeVisible()

  // Open the submission
  await page.getByRole('button', { name: 'View' }).first().click()
  await page.getByRole('button', { name: 'View' }).first().click()
  await expect(page.getByText('Submission Detail')).toBeVisible()

  // Grade the essay 4/5
  await page.locator('input[type="number"]').fill('4')
  await expect(page.getByText('Grade auto-saved')).toBeVisible()

  // Release scores
  await page.getByRole('button', { name: 'Submissions', exact: true }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Release scores').click()
  await expect(page.getByText('Settings updated')).toBeVisible()
})

test('student sees scores and breakdown, but no correct answers while reveal is off', async ({ page }) => {
  await loginAsStudent(page)
  const creds = getCredentials()
  await page.goto(`/dashboard/student/classes/${creds.classId}/assessments/${scoreReleaseAssessmentId}`)

  // Scores released: total visible, but no per-question breakdown until reveal.
  await expect(page.getByText('Score Summary')).toBeVisible()
  await expect(page.getByText('Question Breakdown')).toHaveCount(0)
  await expect(page.getByText('Correct Answer')).toHaveCount(0)
})

test('instructor enables answer reveal', async ({ page }) => {
  await loginAsInstructor(page)
  await openAssessment(page, SCORE_RELEASE_TITLE)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Show answers').click()
  await expect(page.getByText('Settings updated')).toBeVisible()
})

test('student sees correct answers after reveal', async ({ page }) => {
  await loginAsStudent(page)
  const creds = getCredentials()
  await page.goto(`/dashboard/student/classes/${creds.classId}/assessments/${scoreReleaseAssessmentId}`)
  await expect(page.getByText('Score Summary')).toBeVisible()
  await expect(page.getByText('Correct Answer')).toBeVisible()
})

test('instructor creates and publishes a short timed assessment for time extensions', async ({ page }) => {
  await loginAsInstructor(page)
  await createAndPublish(page, {
    title: EXTENSION_TITLE,
    durationMinutes: '1',
    questionText: `[MultipleChoice]
Pick the correct answer.
a) Wrong
b) Right
c) Wrong again
d) Still wrong
Answer: b
Points: 1`,
  })
  extensionAssessmentId = page.url().split('/').pop()!
})

test('instructor grants time to an in-progress timed attempt and the student sees the countdown jump', async ({ browser }) => {
  const studentContext = await browser.newContext()
  const instructorContext = await browser.newContext()
  const studentPage = await studentContext.newPage()
  const instructorPage = await instructorContext.newPage()

  try {
    await loginAsStudent(studentPage)
    const studentCard = studentPage.locator('div.group', { hasText: EXTENSION_TITLE })
    const takeUrl = await studentCard.getByRole('link', { name: 'Start Assessment' }).getAttribute('href')
    await studentPage.goto(`http://localhost:3111${takeUrl}`)
    await expect(studentPage).toHaveURL(/assessments\/[0-9a-f-]+$/)
    await expect(studentPage.getByText('01:00')).toBeVisible()
    await studentPage.getByRole('radio', { name: /b\)\s*Right/ }).check()

    await loginAsInstructor(instructorPage)
    await openAssessment(instructorPage, EXTENSION_TITLE)
    await openStudentAttemptsDialog(instructorPage)
    await grantFiveMinutesToFirstAttempt(instructorPage)
    await expect(instructorPage.getByText('Added 5 minutes')).toBeVisible()

    await expect(studentPage.getByText('Instructor added 5 min')).toBeVisible({ timeout: 20_000 })
    await expect(studentPage.getByText(/0[56]:[0-5][0-9]/)).toBeVisible()

    await studentPage.getByRole('button', { name: 'Submit Assessment' }).click()
    await studentPage.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(studentPage.getByText('Scores not yet released')).toBeVisible()
  } finally {
    await closeContext(studentContext)
    await closeContext(instructorContext)
  }
})

test('instructor can re-open the latest submitted attempt and the student resumes with answers intact', async ({ browser }) => {
  const studentContext = await browser.newContext()
  const instructorContext = await browser.newContext()
  const studentPage = await studentContext.newPage()
  const instructorPage = await instructorContext.newPage()
  const creds = getCredentials()

  try {
    await loginAsStudent(studentPage)
    await studentPage.goto(`/dashboard/student/classes/${creds.classId}/assessments/${extensionAssessmentId}`)
    await expect(studentPage.getByText('Scores not yet released')).toBeVisible()

    await loginAsInstructor(instructorPage)
    await openAssessment(instructorPage, EXTENSION_TITLE)
    await openStudentAttemptsDialog(instructorPage)
    await grantFiveMinutesToFirstAttempt(instructorPage)
    await expect(instructorPage.getByRole('alertdialog')).toContainText('Re-open this attempt?')
    await instructorPage.getByRole('button', { name: 'Re-open and add time' }).click()
    await expect(instructorPage.getByText('Added 5 minutes')).toBeVisible()

    await studentPage.reload()
    await expect(studentPage.getByText('Instructor added time')).toBeVisible()
    await expect(studentPage.getByRole('radio', { name: /b\)\s*Right/ })).toBeChecked()
    await expect(studentPage.getByRole('button', { name: 'Submit Assessment' })).toBeVisible()

    await studentPage.getByRole('button', { name: 'Submit Assessment' }).click()
    await studentPage.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(studentPage.getByText('Scores not yet released')).toBeVisible()
  } finally {
    await closeContext(studentContext)
    await closeContext(instructorContext)
  }
})
