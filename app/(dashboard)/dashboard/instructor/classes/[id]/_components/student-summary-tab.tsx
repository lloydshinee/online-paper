'use client'

import { useState } from 'react'
import { Table2 } from 'lucide-react'
import type { StudentSummaryMatrix, CellState } from '@/lib/student-summary-service'

type Filter = 'all' | 'failed' | 'missing' | 'not_taken'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'failed', label: 'Failed' },
  { key: 'missing', label: 'Missing' },
  { key: 'not_taken', label: 'Not taken' },
]

interface Props {
  matrix: StudentSummaryMatrix | null
}

export function StudentSummaryTab({ matrix }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  if (!matrix || (matrix.assessments.length === 0 && matrix.rows.length === 0)) {
    return (
      <div className="rounded-xl border border-border p-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted mx-auto">
          <Table2 size={24} className="text-muted-foreground" />
        </div>
        <h2 className="text-base font-medium mb-1">No student summary yet</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Scores will appear here once you publish assessments and students start taking them.
        </p>
      </div>
    )
  }

  if (matrix.assessments.length === 0) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No published or closed assessments yet. Publish an assessment to see student scores here.
        </p>
      </div>
    )
  }

  if (matrix.rows.length === 0) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No students enrolled yet. Invite students to see their summary here.
        </p>
      </div>
    )
  }

  const filteredRows = filter === 'all'
    ? matrix.rows
    : matrix.rows.filter((row) =>
      row.cells.values().some((cell) => cell.kind === filter),
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No {filter === 'all' ? '' : filter.replace('_', ' ') + ' '}students found.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card min-w-[160px]">
                  Student
                </th>
                {matrix.assessments.map((a) => (
                  <th
                    key={a.id}
                    className="px-3 py-3 text-left font-medium text-muted-foreground min-w-[140px]"
                    title={a.title}
                  >
                    {a.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.student.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 sticky left-0 bg-card">
                    <div className="font-medium">{row.student.name}</div>
                    <div className="text-xs text-muted-foreground">{row.student.email}</div>
                  </td>
                  {matrix.assessments.map((a) => (
                    <td key={a.id} className="px-3 py-3">
                      <Cell state={row.cells.get(a.id) ?? { kind: 'not_taken' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({ state }: { state: CellState }) {
  switch (state.kind) {
    case 'score':
      return (
        <span className="inline-block">
          {state.score}/{state.total}
        </span>
      )
    case 'failed':
      return (
        <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-medium">
          Failed ({state.score}/{state.total})
        </span>
      )
    case 'missing':
      return (
        <span className="inline-block text-muted-foreground">
          Missing
        </span>
      )
    case 'not_taken':
      return (
        <span className="inline-block text-muted-foreground">
          Not taken
        </span>
      )
    case 'in_progress':
      return (
        <span className="inline-block text-blue-600">
          In progress
        </span>
      )
  }
}
