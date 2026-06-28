'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ResetPasswordDialogProps {
  userId: string
  email: string
  name: string
  onReset?: () => void
}

import { resetPasswordAction } from '@/app/actions/admin'

export function ResetPasswordDialog({ userId, email, name, onReset }: ResetPasswordDialogProps) {
  const [state, action, pending] = useActionState(resetPasswordAction, null)

  if (state?.success) {
    setTimeout(() => onReset?.(), 100)
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Reset
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {email}
          </DialogDescription>
        </DialogHeader>
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
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          {state?.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Resetting...' : 'Reset password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
