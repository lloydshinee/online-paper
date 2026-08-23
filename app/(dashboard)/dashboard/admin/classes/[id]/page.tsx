'use client'

import { useState, useEffect, use, useCallback } from 'react'
import DashboardHeader from '@/components/dashboard-header'
import { getAdminClassAssessments, getAdminClassStudents } from '@/app/actions/admin'
import { getCurrentUserProfileAction } from '@/app/actions/profile'
import { DataTablePagination } from '@/components/data-table-pagination'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search } from 'lucide-react'
import Link from 'next/link'

interface AssessmentData {
  id: string
  title: string
  mode: string
  state: string
  submission_count: number
}

interface StudentData {
  id: string
  name: string
  email: string
  submission_status: string | null
  score_total: number | null
}

const STUDENT_PAGE = 20

export default function AdminClassPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: classId } = use(paramsPromise)

  const [className, setClassName] = useState('')
  const [userName, setUserName] = useState('')
  const [userFirstname, setUserFirstname] = useState<string | null>(null)
  const [userLastname, setUserLastname] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const [assessments, setAssessments] = useState<AssessmentData[]>([])
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentData[]>([])
  const [studentTotal, setStudentTotal] = useState(0)
  const [studentPage, setStudentPage] = useState(1)
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSearchInput, setStudentSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)

  useEffect(() => {
    // The header's identity comes from the session, never from user lists:
    // the first row of getUsers() is whoever registered most recently.
    getCurrentUserProfileAction().then((profile) => {
      if (profile) {
        setUserName([profile.firstname, profile.lastname].filter(Boolean).join(' ') || 'Admin')
        setUserFirstname(profile.firstname)
        setUserLastname(profile.lastname)
        setUserEmail(profile.email)
        setUserAvatarUrl(profile.avatar_url)
      }
    })
    getAdminClassAssessments(classId).then((r) => {
      setClassName(r.className)
      setAssessments(r.assessments)
      setLoading(false)
    })
  }, [classId])

  const loadStudents = useCallback(async (page: number, search: string, assessmentId: string) => {
    setLoadingStudents(true)
    const offset = (page - 1) * STUDENT_PAGE
    const r = await getAdminClassStudents(classId, assessmentId, STUDENT_PAGE, offset, search || undefined)
    setStudents(r.students)
    setStudentTotal(r.total)
    setLoadingStudents(false)
  }, [classId])

  function handleAssessmentSelect(assessmentId: string | null) {
    if (assessmentId === null) {
      setSelectedAssessment(null)
      setStudents([])
      setStudentTotal(0)
      return
    }
    setSelectedAssessment(assessmentId)
    setStudentPage(1)
    setStudentSearch('')
    setStudentSearchInput('')
    loadStudents(1, '', assessmentId)
  }

  function handleStudentSearch() {
    setStudentPage(1)
    setStudentSearch(studentSearchInput)
    loadStudents(1, studentSearchInput, selectedAssessment!)
  }

  function handleStudentPage(page: number) {
    setStudentPage(page)
    loadStudents(page, studentSearch, selectedAssessment!)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        userName={userName}
        userFirstname={userFirstname}
        userLastname={userLastname}
        userEmail={userEmail}
        userAvatarUrl={userAvatarUrl}
      />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/dashboard/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={14} /> Back to admin
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight mb-8">{className}</h1>

        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No assessments in this class.</p>
        ) : (
          <div className="grid gap-6">
            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-6 py-4">
                <p className="text-sm font-medium">Assessments</p>
              </div>
              {/* No -mx-6 here: the card itself has no padding to cancel,
                   so full-bleed rows would overhang the border box. */}
              <div className="divide-y divide-border">
                {assessments.map((a) => (
                  <button key={a.id}
                    onClick={() => handleAssessmentSelect(selectedAssessment === a.id ? null : a.id)}
                    className={`w-full text-left px-6 py-4 hover:bg-muted/50 transition-colors ${selectedAssessment === a.id ? 'bg-muted/30' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{a.mode}</span>
                          <span className={`rounded px-1.5 py-0.5 text-xs ${
                            a.state === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                          }`}>{a.state}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{a.submission_count} submissions</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedAssessment && (
              <div className="rounded-xl border border-border">
                <div className="border-b border-border px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Student Submissions</p>
                    <p className="text-xs text-muted-foreground">{studentTotal} enrolled</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input className="h-8 w-36 pl-8 text-xs" placeholder="Search student..."
                        value={studentSearchInput}
                        onChange={(e) => setStudentSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleStudentSearch() }}
                      />
                    </div>
                    <button onClick={handleStudentSearch}
                      className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors">Search</button>
                    {studentSearch && (
                      <button onClick={() => { setStudentSearchInput(''); setStudentSearch(''); loadStudents(1, '', selectedAssessment); setStudentPage(1) }}
                        className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4">
                  {loadingStudents ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                  ) : students.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No students found.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-border -mx-6">
                        {students.map((s) => (
                          <div key={s.id} className="px-6 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.email}</p>
                            </div>
                            <div className="text-right">
                              {s.submission_status ? (
                                <>
                                  <span className={`rounded px-1.5 py-0.5 text-xs ${
                                    s.submission_status === 'submitted' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                    : s.submission_status === 'in_progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                    : 'bg-muted text-muted-foreground'
                                  }`}>{s.submission_status.replace('_', ' ')}</span>
                                  {s.score_total != null && <p className="text-xs font-medium mt-0.5">{s.score_total} pts</p>}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not started</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <DataTablePagination page={studentPage} pageSize={STUDENT_PAGE} total={studentTotal} onPageChange={handleStudentPage} />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
