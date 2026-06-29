'use client'

import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { resetPasswordAction } from '@/app/actions/admin'

interface ResetPasswordFormProps {
  userId: string
  onReset: () => void
  onError: (msg: string) => void
}

export function ResetPasswordForm({ userId, onReset, onError }: ResetPasswordFormProps) {
  const [state, action, pending] = useActionState(resetPasswordAction, null)

  useEffect(() => {
    if (state?.success) {
      onReset()
    }
  }, [state?.success, onReset])

  useEffect(() => {
    if (state?.error) {
      onError(state.error)
    }
  }, [state?.error, onError])

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className="text-sm font-medium">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={6}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Min 6 characters"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Resetting...' : 'Reset password'}
      </Button>
    </form>
  )
}
