'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRosterAction, removeStudentAction } from '@/app/actions/classes'
import { DataTablePagination } from '@/components/data-table-pagination'
import { Input } from '@/components/ui/input'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Users, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Student {
  id: string
  firstname: string | null
  lastname: string | null
  email: string
}

const PAGE_SIZE = 20

export function StudentRoster({ classId, initialCount }: { classId: string; initialCount: number }) {
  const [students, setStudents] = useState<Student[]>([])
  const [total, setTotal] = useState(initialCount)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const loadStudents = useCallback(async (p: number, s: string) => {
    setLoading(true)
    const r = await getRosterAction(classId, p, PAGE_SIZE, s || undefined)
    setStudents(r.students as Student[])
    setTotal(r.total)
    setLoading(false)
  }, [classId])

  useEffect(() => {
    loadStudents(page, search)
  }, [page, search, loadStudents])

  function handleSearch() {
    setPage(1)
    setSearch(searchInput)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
  }

  async function handleRemove(studentId: string, studentName: string) {
    const result = await removeStudentAction(classId, studentId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${studentName} removed from class`)
      loadStudents(page, search)
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Users size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Student Roster</h2>
        <Badge variant="secondary" className="ml-1">{total}</Badge>
      </div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search students..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            />
          </div>
          <button onClick={handleSearch}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors">
            Search
          </button>
          {search && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
              className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {search ? 'No students match your search.' : 'No students enrolled yet. Share the invite code with your students.'}
            </p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {students.map((s) => {
                const name = [s.firstname, s.lastname].filter(Boolean).join(' ') || 'Unknown'
                return (
                  <div key={s.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive" />
                      }>
                        <Trash2 size={14} />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove student?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Remove {name} ({s.email}) from this class? Their submissions and scores will be deleted. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemove(s.id, name)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )
              })}
            </div>
          )}
          {students.length > 0 && (
            <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={handlePageChange} />
          )}
        </div>
      </div>
    </section>
  )
}
