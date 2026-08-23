'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserProfileAction, type CurrentUserProfile } from '@/app/actions/profile'

/**
 * The signed-in user's own profile for client-page headers. Client pages
 * must derive header identity from this session action — never by scanning
 * user lists or rendering hardcoded empty props.
 */
export function useCurrentUserProfile(): CurrentUserProfile | null {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)

  useEffect(() => {
    let cancelled = false
    getCurrentUserProfileAction().then((p) => {
      if (!cancelled && p) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return profile
}

/** Compose the header display name from a possibly-unloaded profile. */
export function profileDisplayName(profile: CurrentUserProfile | null, fallback = 'User'): string {
  if (!profile) return fallback
  return (
    [profile.firstname, profile.lastname]
      .filter(Boolean)
      .join(' ') || fallback
  )
}
