'use client'

import { useActionState, useEffect } from 'react'
import { joinClassAction } from '@/app/actions/classes'

interface JoinClassFormProps {
  onSuccess: () => void
  onError: (msg: string) => void
}

export function JoinClassForm({ onSuccess, onError }: JoinClassFormProps) {
  const [state, action, pending] = useActionState(joinClassAction, null)

  useEffect(() => {
    if (state?.success) {
      onSuccess()
    }
  }, [state?.success, onSuccess])

  useEffect(() => {
    if (state?.error) {
      onError(state.error)
    }
  }, [state?.error, onError])

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="joinCode" className="text-sm font-medium">Invite code</label>
        <input id="joinCode" name="joinCode" type="text" required
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring uppercase"
          placeholder="e.g. ABCDEF12" />
      </div>
      <button type="submit" disabled={pending}
        className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
        {pending ? 'Joining...' : 'Join class'}
      </button>
    </form>
  )
}
