/**
 * Avatar storage-path resolution.
 *
 * users.avatar_url stores the object path inside the avatars bucket
 * (e.g. "ab7adc44-cd07-4b52-a9a2-ee67df1a96c0/avatar.jpeg") rather than a
 * public URL: getPublicUrl() bakes the configuring environment's host into
 * the database, and a localhost URL recorded on one machine is broken for
 * every other viewer.
 */
export const AVATAR_BUCKET = 'avatars'

export function avatarObjectPath(userId: string, ext: string): string {
  return `${userId}/avatar.${ext}`
}

/**
 * Resolve a stored avatar_url to a loadable src against the configured
 * Supabase instance. Accepts the current relative-path format and, for rows
 * written before this change, an absolute URL from any prior environment —
 * its /storage/v1/object/public/… suffix is re-homed onto the configured
 * instance (avatars only ever live in this app's own storage).
 */
export function avatarSrc(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null

  const legacyAbsolute = avatarUrl.match(/^https?:\/\/[^/]+(\/storage\/v1\/object\/public\/.+)$/)
  if (legacyAbsolute) {
    return `${base}${legacyAbsolute[1]}`
  }

  if (/^https?:\/\//i.test(avatarUrl)) {
    // Unknown external URL — render as-is rather than guess.
    return avatarUrl
  }

  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${avatarUrl.replace(/^\/+/, '')}`
}
