'use client'

import { useActionState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createClassAction } from '@/app/actions/classes'

export function CreateClassDialog() {
  const [state, action, pending] = useActionState(createClassAction, null)

  return (
    <Dialog>
      <DialogTrigger render={<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
        Create class
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create class</DialogTitle>
          <DialogDescription>Create a new class. An invite code will be generated automatically.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">Class name</label>
            <input id="name" name="name" type="text" required
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Math 101" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
          <button type="submit" disabled={pending}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {pending ? 'Creating...' : 'Create class'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
