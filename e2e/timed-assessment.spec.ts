import { test, expect, type Page } from '@playwright/test'
import { loginAsInstructor, loginAsStudent, getCredentials } from './helpers'

/**
 * End-to-end timed assessment flow: create → publish → take → grade →
 * release scores → reveal answers. Covers the score-stripping and
 * answer-reveal gating behavior from tickets 01 and 05.
 */

test.describe.configure({ mode: 'serial' })

const ASSESSMENT_TITLE = `E2E Timed ${Date.now()}`
let assessmentId = ''

async function createAndPublish(page: Page) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}/assessments/create`)
  await page.locator('#title').fill(ASSESSMENT_TITLE)
  await page.locator('#durationMinutes').fill('30')
  await page.getByRole('button', { name: 'Create Assessment' }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)
  assessmentId = page.url().split('/').pop()!

  // Add questions via the paste tab
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

  // Close the add-questions dialog so the tabs are clickable
  await page.keyboard.press('Escape')

  // Publish via the settings tab
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Publish assessment').click()
  await expect(page.getByText('Assessment published')).toBeVisible()
}

test('instructor creates and publishes a timed assessment', async ({ page }) => {
  await loginAsInstructor(page)
  await createAndPublish(page)
})

test('student takes the assessment and submits', async ({ page }) => {
  await loginAsStudent(page)
  const card = page.locator('div.group', { hasText: ASSESSMENT_TITLE })
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
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await page.getByText(ASSESSMENT_TITLE).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)

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
  await page.goto(`/dashboard/student/classes/${creds.classId}/assessments/${assessmentId}`)

  // Scores released: summary + breakdown visible
  await expect(page.getByText('Score Summary')).toBeVisible()
  await expect(page.getByText('Question Breakdown')).toBeVisible()

  // Breakdown shows points earned and the student's own answers
  await expect(page.getByText('Earned')).toBeVisible()
  await expect(page.getByText('Your Answer')).toBeVisible()
  await expect(page.getByText(/b\) 4/)).toBeVisible()

  // Correct-answer column must stay hidden while reveal is off
  await expect(page.getByText('Correct Answer')).toHaveCount(0)
  await expect(page.getByText(/Photosynthesis converts light/).first()).toBeVisible()
})

test('instructor enables answer reveal', async ({ page }) => {
  await loginAsInstructor(page)
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await page.getByText(ASSESSMENT_TITLE).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Show answers').click()
  await expect(page.getByText('Settings updated')).toBeVisible()
})

test('student sees correct answers after reveal', async ({ page }) => {
  await loginAsStudent(page)
  const creds = getCredentials()
  await page.goto(`/dashboard/student/classes/${creds.classId}/assessments/${assessmentId}`)
  await expect(page.getByText('Score Summary')).toBeVisible()
  await expect(page.getByText('Correct Answer')).toBeVisible()
})
