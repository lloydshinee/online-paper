import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { avatarObjectPath, avatarSrc } from '@/lib/avatar'

const INSTANCE = 'http://192.168.1.11:8000'

describe('avatar src resolution', () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = INSTANCE
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original
  })

  test('object path builds from user id and extension', () => {
    expect(avatarObjectPath('uid-1', 'jpeg')).toBe('uid-1/avatar.jpeg')
  })

  test('resolves a stored object path against the configured instance', () => {
    expect(avatarSrc('uid-1/avatar.jpeg')).toBe(
      `${INSTANCE}/storage/v1/object/public/avatars/uid-1/avatar.jpeg`,
    )
  })

  test('tolerates a leading slash on stored paths', () => {
    expect(avatarSrc('/uid-1/avatar.jpeg')).toBe(
      `${INSTANCE}/storage/v1/object/public/avatars/uid-1/avatar.jpeg`,
    )
  })

  test('re-homes a legacy absolute URL recorded under a previous host', () => {
    // The reported bug: an upload while the app pointed at localhost froze
    // that host into the database, breaking the image on every other device.
    expect(
      avatarSrc('http://localhost:8000/storage/v1/object/public/avatars/uid-1/avatar.jpeg'),
    ).toBe(`${INSTANCE}/storage/v1/object/public/avatars/uid-1/avatar.jpeg`)
    expect(
      avatarSrc('http://10.13.19.11:8000/storage/v1/object/public/avatars/uid-2/avatar.png'),
    ).toBe(`${INSTANCE}/storage/v1/object/public/avatars/uid-2/avatar.png`)
  })

  test('passes through unknown external URLs untouched', () => {
    expect(avatarSrc('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg')
  })

  test('null and empty stay null', () => {
    expect(avatarSrc(null)).toBeNull()
    expect(avatarSrc('')).toBeNull()
    expect(avatarSrc(undefined)).toBeNull()
  })
})
