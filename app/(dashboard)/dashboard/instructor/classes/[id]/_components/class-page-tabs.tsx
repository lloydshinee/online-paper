import Link from 'next/link'

export type ClassPageTab = 'assessments' | 'roster' | 'summary'

const CLASS_PAGE_TABS: { key: ClassPageTab; label: string }[] = [
  { key: 'assessments', label: 'Assessments' },
  { key: 'roster', label: 'Roster' },
  { key: 'summary', label: 'Student Summary' },
]

export function parseClassPageTab(value: string | string[] | undefined): ClassPageTab {
  return value === 'roster' || value === 'summary' ? value : 'assessments'
}

export function classPageHref(classId: string, tab: ClassPageTab): string {
  return tab === 'assessments'
    ? `/dashboard/instructor/classes/${classId}`
    : `/dashboard/instructor/classes/${classId}?tab=${tab}`
}

export function ClassPageTabs({ classId, active }: { classId: string; active: ClassPageTab }) {
  return (
    <div className="flex border-b border-border mb-8">
      {CLASS_PAGE_TABS.map((t) => (
        <Link
          key={t.key}
          href={classPageHref(classId, t.key)}
          aria-current={active === t.key ? 'page' : undefined}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
