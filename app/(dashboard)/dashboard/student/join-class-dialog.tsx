'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { JoinClassForm } from './join-class-form'

export function JoinClassDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors" />}>
        Join class
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a class</DialogTitle>
          <DialogDescription>Enter the invitation code provided by your instructor.</DialogDescription>
        </DialogHeader>
        {open && (
          <JoinClassForm
            onSuccess={() => {
              setOpen(false)
              toast.success('Successfully joined the class')
            }}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
