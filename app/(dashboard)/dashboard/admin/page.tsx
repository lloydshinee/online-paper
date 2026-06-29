'use client'

import { useState, useEffect, useCallback, startTransition } from 'react'
import DashboardHeader from '@/components/dashboard-header'
import { getUsers, getSystemOverview } from '@/app/actions/admin'
import { CreateUserDialog } from './create-user-dialog'
import { UserTable } from './user-table'
import { DataTablePagination } from '@/components/data-table-pagination'
import { Input } from '@/components/ui/input'
import { Users, BarChart3, Search } from 'lucide-react'
import type { UserProfile } from '@/lib/auth/auth-service'
import Link from 'next/link'

interface OverviewClass {
  id: string
  name: string
  join_code: string
  instructor_id: string
  created_at: string
  archived: boolean
  assessments: {
    id: string
    title: string
    mode: string
    state: string
    submission_count: number
  }[]
}

const PAGE_SIZE = 20

export default function AdminDashboard() {
  const [tab, setTab] = useState<'users' | 'overview'>('users')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [userTotal, setUserTotal] = useState(0)
  const [userPage, setUserPage] = useState(1)
  const [userSearch, setUserSearch] = useState('')
  const [userSearchInput, setUserSearchInput] = useState('')
  const [overview, setOverview] = useState<OverviewClass[]>([])
  const [overviewSearch, setOverviewSearch] = useState('')
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [userName, setUserName] = useState('')

  const loadUsers = useCallback(async (page: number, search: string) => {
    const offset = (page - 1) * PAGE_SIZE
    const r = await getUsers(PAGE_SIZE, offset, search || undefined)
    setUsers(r.users)
    setUserTotal(r.total)
    if (page === 1) {
      const r0 = await getUsers(1, 0)
      const found = r0.users.find((u) => u.role === 'admin')
      if (found) setUserName(found.name ?? 'Admin')
    }
  }, [])

  useEffect(() => {
    let ignore = false
    async function fetch() {
      await loadUsers(1, '')
    }
    fetch()
    return () => { ignore = true }
  }, [loadUsers])

  useEffect(() => {
    if (tab === 'overview' && overview.length === 0) {
      let ignore = false
      startTransition(() => setLoadingOverview(true))
      getSystemOverview().then((r) => {
        if (!ignore) {
          startTransition(() => {
            setOverview(r.classes as OverviewClass[])
            setLoadingOverview(false)
          })
        }
      })
      return () => { ignore = true }
    }
  }, [tab, overview.length])

  function handleUserSearch() {
    setUserPage(1)
    loadUsers(1, userSearchInput)
    setUserSearch(userSearchInput)
  }

  function handleUserPage(page: number) {
    setUserPage(page)
    loadUsers(page, userSearch)
  }

  function handleOverviewSearch() {
    setLoadingOverview(true)
    getSystemOverview(overviewSearch || undefined).then((r) => {
      setOverview(r.classes as OverviewClass[])
      setLoadingOverview(false)
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={userName} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">Manage users and oversee the platform</p>
          </div>
          {tab === 'users' && <CreateUserDialog />}
        </div>

        <div className="flex border-b border-border mb-8">
          <button onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Users size={14} /> Users
          </button>
          <button onClick={() => setTab('overview')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <BarChart3 size={14} /> System Overview
          </button>
        </div>

        {tab === 'users' && (
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Users</p>
                <p className="text-xs text-muted-foreground">{userTotal} registered user{userTotal !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 w-48 pl-8 text-xs"
                    placeholder="Search name or email..."
                    value={userSearchInput}
                    onChange={(e) => setUserSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUserSearch() }}
                  />
                </div>
                <button onClick={handleUserSearch}
                  className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors">
                  Search
                </button>
                {userSearch && (
                  <button onClick={() => { setUserSearchInput(''); setUserSearch(''); loadUsers(1, ''); setUserPage(1) }}
                    className="text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-4">
              <UserTable users={users} />
              <DataTablePagination page={userPage} pageSize={PAGE_SIZE} total={userTotal} onPageChange={handleUserPage} />
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search class name..."
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleOverviewSearch() }}
                />
              </div>
              <button onClick={handleOverviewSearch}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors">
                Search
              </button>
            </div>
            {loadingOverview ? (
              <p className="text-sm text-muted-foreground text-center py-12">Loading overview...</p>
            ) : overview.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No classes found.</p>
            ) : (
              <div className="space-y-4">
                {overview.map((cls) => (
                  <Link key={cls.id} href={`/dashboard/admin/classes/${cls.id}`}
                    className="block rounded-xl border border-border hover:border-primary/50 transition-colors">
                    <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{cls.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Code: {cls.join_code} · {cls.assessments.length} assessment{cls.assessments.length !== 1 ? 's' : ''}
                          {cls.archived ? ' · Archived' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="px-6 py-4">
                      {cls.assessments.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No assessments in this class.</p>
                      ) : (
                        <div className="divide-y divide-border -mx-6">
                          {cls.assessments.map((a) => (
                            <div key={a.id} className="px-6 py-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm">{a.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground capitalize">{a.mode}</span>
                                  <span className={`rounded px-1.5 py-0.5 text-xs ${
                                    a.state === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                    : a.state === 'draft' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                    : 'bg-muted text-muted-foreground'
                                  }`}>{a.state}</span>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">{a.submission_count} submission{a.submission_count !== 1 ? 's' : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
