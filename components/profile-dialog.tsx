'use client'

import { useActionState, useRef, useState } from 'react'
import { updateProfileAction, uploadAvatarAction } from '@/app/actions/profile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Camera } from 'lucide-react'
import { avatarSrc } from '@/lib/avatar'

export function ProfileDialog({
  userName,
  firstname: initialFirstname,
  lastname: initialLastname,
  email,
  avatarUrl: initialAvatarUrl,
}: {
  userName: string
  firstname: string | null
  lastname: string | null
  email: string
  avatarUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateProfileAction, null)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayAvatarUrl = avatarSrc(avatarUrl) ?? avatarSrc(initialAvatarUrl)

  const initials = [
    initialFirstname?.[0] ?? '',
    initialLastname?.[0] ?? '',
  ].filter(Boolean).join('').toUpperCase() || '?'

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.set('avatar', file)

    const result = await uploadAvatarAction(null, formData)
    if (result?.error) {
      setUploadError(result.error)
    } else if (result?.url) {
      setAvatarUrl(result.url)
    }
    setUploading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button className="flex items-center gap-2 text-sm text-muted-foreground truncate hover:text-foreground transition-colors text-left" />
      }>
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border overflow-hidden">
          {displayAvatarUrl ? (
            <img src={displayAvatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground">{initials}</span>
          )}
        </div>
        <span className="truncate">{userName}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Update your name and photo</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group relative flex size-20 items-center justify-center rounded-full bg-muted overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all"
          >
            {displayAvatarUrl ? (
              <img src={displayAvatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xl font-semibold text-muted-foreground">{initials}</span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarSelect}
          />
          {uploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>

        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="firstname" className="text-sm font-medium">First name</label>
            <input
              id="firstname"
              name="firstname"
              type="text"
              required
              defaultValue={initialFirstname ?? ''}
              className="flex h-10 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lastname" className="text-sm font-medium">Last name</label>
            <input
              id="lastname"
              name="lastname"
              type="text"
              defaultValue={initialLastname ?? ''}
              className="flex h-10 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-sm px-3 py-2 rounded-lg border border-border bg-muted/50 text-muted-foreground">
              {email}
            </p>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          {state?.success && (
            <p className="text-sm text-green-600 dark:text-green-400">{state.success}</p>
          )}
          <DialogFooter>
            <button
              type="submit"
              disabled={pending}
              className="flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pending ? 'Saving...' : 'Save'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
