'use client'

import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function QuestionFormatGuide() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      >
        <BookOpen size={14} />
        Format guide
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Question format guide</DialogTitle>
            <DialogDescription>
              Use this format when pasting questions in bulk on the assessment&apos;s &ldquo;Paste text&rdquo; tab.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium mb-2">Section headers</p>
            <pre className="text-[10px] text-muted-foreground leading-relaxed">
{`[MultipleChoice]
Question stem here
a) First option
b) Second option
c) Third option
d) Fourth option
Answer: b
Points: 5

[TrueOrFalse]
Statement here
Answer: True
Points: 3

[FillInTheBlank]
Sentence with a ______ marking the blank.
Answer: correct text
Points: 2

[Essay]
Essay prompt here
Points: 10

[Coding]
Coding problem description here
Points: 15`}
            </pre>

            <p className="text-xs font-medium mt-3 mb-1">Rules</p>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <p>&bull; Each question in a section is separated by a blank line</p>
              <p>&bull; MultipleChoice always has exactly 4 options labeled a) b) c) d)</p>
              <p>&bull; MultipleChoice/FillInTheBlank use &ldquo;Answer: &rdquo; followed by the correct answer</p>
              <p>&bull; TrueOrFalse uses &ldquo;Answer: True&rdquo; or &ldquo;Answer: False&rdquo;</p>
              <p>&bull; Essay and Coding have no Answer line (manual grading)</p>
              <p>&bull; Add &ldquo;Points: N&rdquo; to any question to set its score (defaults to 1 if omitted)</p>
              <p>&bull; Use section headers exactly as shown in brackets</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
