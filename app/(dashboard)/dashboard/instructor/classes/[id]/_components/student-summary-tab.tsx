import { Table2 } from 'lucide-react'

export function StudentSummaryTab() {
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
