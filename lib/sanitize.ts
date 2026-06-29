export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

export function sanitizeProfile(input: string | null): string | null {
  if (!input) return input
  return sanitize(input)
}
