import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function requireString(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    throw new Error(`Expected form field "${key}" to be a string, got ${typeof value}`)
  }
  return value
}
