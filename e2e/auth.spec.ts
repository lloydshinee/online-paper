import { test, expect } from '@playwright/test'
import { loginAsInstructor, loginAsStudent } from './helpers'

test.describe('authentication', () => {
  test('instructor can log in and see the dashboard', async ({ page }) => {
    await loginAsInstructor(page)
    await expect(page.getByRole('heading', { name: 'Instructor Dashboard' })).toBeVisible()
  })

  test('student can log in and see the dashboard with their class', async ({ page }) => {
    await loginAsStudent(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('E2E Class')).toBeVisible()
  })
})
