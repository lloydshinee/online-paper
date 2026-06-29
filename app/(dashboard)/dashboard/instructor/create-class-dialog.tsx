'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CreateClassForm } from './create-class-form'

export function CreateClassDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
        Create class
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create class</DialogTitle>
          <DialogDescription>Create a new class. An invite code will be generated automatically.</DialogDescription>
        </DialogHeader>
        {open && (
          <CreateClassForm
            onSuccess={(name) => {
              setOpen(false)
              toast.success(`Created class "${name}"`)
            }}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
