'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ResetPasswordForm } from './reset-password-form'

interface ResetPasswordDialogProps {
  userId: string
  email: string
  name: string
  onReset?: () => void
}

export function ResetPasswordDialog({ userId, email, onReset }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        {open && (
          <ResetPasswordForm
            userId={userId}
            onReset={() => {
              onReset?.()
              setOpen(false)
              toast.success('Password reset successfully')
            }}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
