import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

export interface E2ECredentials {
  instructorEmail: string
  studentEmail: string
  password: string
  classId: string
  joinCode: string
}

export function getCredentials(): E2ECredentials {
  const raw = readFileSync(join(__dirname, '.auth', 'credentials.json'), 'utf-8')
  return JSON.parse(raw) as E2ECredentials
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard/)
}

export async function loginAsInstructor(page: Page) {
  const creds = getCredentials()
  await login(page, creds.instructorEmail, creds.password)
}

export async function loginAsStudent(page: Page) {
  const creds = getCredentials()
  await login(page, creds.studentEmail, creds.password)
}
