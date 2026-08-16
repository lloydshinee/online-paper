import { test, expect, type Page } from '@playwright/test'
import { loginAsInstructor, getCredentials } from './helpers'

/**
 * Instructor question-entry flow: covers ticket 14 (parser hardening) and
 * the UI surfacing of parse warnings.
 */

async function createTimedAssessment(page: Page, title: string) {
  const creds = getCredentials()
  await page.goto(`/dashboard/instructor/classes/${creds.classId}`)
  await page.getByRole('link', { name: 'Create' }).click()
  await expect(page).toHaveURL(/assessments\/create/)
  await page.locator('#title').fill(title)
  await page.locator('#durationMinutes').fill('30')
  await page.getByRole('button', { name: 'Create Assessment' }).click()
  await expect(page).toHaveURL(/assessments\/[0-9a-f-]+$/)
}

async function openPasteTab(page: Page) {
  await page.getByRole('button', { name: 'Add questions' }).click()
  await page.getByRole('button', { name: 'Paste text' }).click()
}

test('a 5-option MC question with answer e parses fully', async ({ page }) => {
  await loginAsInstructor(page)
  await createTimedAssessment(page, 'Parser E2E Assessment')

  await openPasteTab(page)
  await page.locator('textarea').fill(`[MultipleChoice]
Which of these is a primary color?
a) Orange
b) Purple
c) Green
d) Brown
e) Red
Answer: e
Points: 2`)

  await page.getByRole('button', { name: /Add 1 parsed question/ }).click()
  await expect(page.getByText('Added 1 question')).toBeVisible()

  // Close the add-questions dialog so the question list is clickable.
  await page.keyboard.press('Escape')

  // The question list shows the stem and 2 pts.
  await expect(page.getByText('Which of these is a primary color?')).toBeVisible()
  await expect(page.getByText('1 question — 2 total pts')).toBeVisible()
})

test('invalid Points and malformed headers produce visible warnings', async ({ page }) => {
  await loginAsInstructor(page)
  await createTimedAssessment(page, 'Parser Warnings E2E')

  await openPasteTab(page)
  await page.locator('textarea').fill(`[MultipleChoice] oops
What is 2+2?
a) 3
b) 4
Answer: b

[MultipleChoice]
What is 3+3?
a) 5
b) 6
Answer: b
Points: 2.5`)

  await page.getByRole('button', { name: /Add 0 parsed question/ }).click()

  // Three problems: the malformed header, its discarded body, and the
  // invalid Points value.
  await expect(page.getByText(/3 problems found/)).toBeVisible()
  await expect(page.getByText(/malformed section header/).first()).toBeVisible()
  await expect(page.getByText(/was discarded/).first()).toBeVisible()
  await expect(page.getByText(/Points must be a whole number greater than 0/).first()).toBeVisible()
})

test('an essay prompt with blank lines parses as one question with authored points', async ({ page }) => {
  await loginAsInstructor(page)
  await createTimedAssessment(page, 'Parser Essay E2E')

  await openPasteTab(page)
  await page.locator('textarea').fill(`[Essay]
Describe the French Revolution.

Include economic, social, and political causes.
Points: 10`)

  await page.getByRole('button', { name: /Add 1 parsed question/ }).click()
  await expect(page.getByText('Added 1 question')).toBeVisible()
  await expect(page.getByText('1 question — 10 total pts')).toBeVisible()
})
