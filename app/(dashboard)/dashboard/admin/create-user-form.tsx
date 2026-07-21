'use client'

import { useActionState, useEffect } from 'react'
import { createUserAction } from '@/app/actions/admin'

interface CreateUserFormProps {
  onCreated: () => void
  onError: (msg: string) => void
}

export function CreateUserForm({ onCreated, onError }: CreateUserFormProps) {
  const [state, action, pending] = useActionState(createUserAction, null)

  useEffect(() => {
    if (state?.success) {
      onCreated()
    }
  }, [state?.success, onCreated])

  useEffect(() => {
    if (state?.error) {
      onError(state.error)
    }
  }, [state?.error, onError])

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="firstname" className="text-sm font-medium">First name</label>
        <input id="firstname" name="firstname" type="text" required
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="First name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lastname" className="text-sm font-medium">Last name</label>
        <input id="lastname" name="lastname" type="text"
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Last name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="user@example.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required minLength={6}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Min 6 characters" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-sm font-medium">Role</label>
        <select id="role" name="role" required
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
          <option value="instructor">Instructor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button type="submit" disabled={pending}
        className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
        {pending ? 'Creating...' : 'Create account'}
      </button>
    </form>
  )
}
