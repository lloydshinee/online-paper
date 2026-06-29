'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CreateUserForm } from './create-user-form'

interface CreateUserDialogProps {
  onCreated?: () => void
}

export function CreateUserDialog({ onCreated }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
        Create account
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>Create a new instructor or admin account.</DialogDescription>
        </DialogHeader>
        {open && (
          <CreateUserForm
            onCreated={() => {
              onCreated?.()
              setOpen(false)
              toast.success('Account created successfully')
            }}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
