'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deactivateUserAction } from '@/app/actions/admin'
import { ResetPasswordDialog } from './reset-password-dialog'
import type { UserProfile } from '@/lib/auth/auth-service'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function UserTable({ users }: { users: UserProfile[] }) {
  const router = useRouter()
  const [deactivating, setDeactivating] = useState<string | null>(null)

  async function handleDeactivate(userId: string) {
    setDeactivating(userId)
    await deactivateUserAction(userId)
    setDeactivating(null)
    router.refresh()
  }

  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No users found
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.name}</TableCell>
            <TableCell>{u.email}</TableCell>
            <TableCell>
              <Badge variant={u.role === 'admin' ? 'default' : u.role === 'instructor' ? 'secondary' : 'outline'}>
                {u.role}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <ResetPasswordDialog
                  userId={u.id}
                  email={u.email}
                  name={u.name ?? ''}
                  onReset={() => router.refresh()}
                />
                <AlertDialog>
                  <AlertDialogTrigger render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deactivating === u.id}
                    />
                  }>
                    {deactivating === u.id ? '...' : 'Deactivate'}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {u.email}. They will no longer
                        be able to log in. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeactivate(u.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Deactivate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
