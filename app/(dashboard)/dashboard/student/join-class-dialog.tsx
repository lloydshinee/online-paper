'use client'

import { useActionState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { joinClassAction } from '@/app/actions/classes'

export function JoinClassDialog() {
  const [state, action, pending] = useActionState(joinClassAction, null)

  return (
    <Dialog>
      <DialogTrigger render={<button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors" />}>
        Join class
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a class</DialogTitle>
          <DialogDescription>Enter the invitation code provided by your instructor.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="joinCode" className="text-sm font-medium">Invite code</label>
            <input id="joinCode" name="joinCode" type="text" required
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring uppercase"
              placeholder="e.g. ABCDEF12" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
          <button type="submit" disabled={pending}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {pending ? 'Joining...' : 'Join class'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
