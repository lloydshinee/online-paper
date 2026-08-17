import type { ParsedQuestion } from '@/lib/question-parser'

export interface QuestionItem extends ParsedQuestion { id?: string }
export interface AssessmentInfo {
  id: string
  class_id: string
  title: string
  mode: string
  state: string
  duration_minutes: number | null
  scores_released: boolean
  answer_reveal_enabled: boolean
  accepting_submissions: boolean
  retakes_allowed: boolean
}

export interface SubmissionData {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: string
  score_total: number | null
  violations: number
  student_name: string
  student_email: string
  pending_count: number
  extra_seconds: number
  remaining_seconds: number | null
}

export interface SubmissionDetail {
  id: string
  assessment_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  status: string
  score_total: number | null
  violations: number
  assessment_title: string
  answers: AnswerDetail[]
}

export interface AnswerDetail {
  id: string
  question_id: string
  answer_content: Record<string, unknown>
  score: number | null
  is_correct: boolean | null
  feedback: string | null
  questions: {
    type: string
    content: Record<string, unknown>
    points: number
  }
}

export type PageTab = 'questions' | 'settings' | 'submissions'
export type InputTab = 'manual' | 'paste'

export const typeOrder = ['MultipleChoice', 'TrueOrFalse', 'FillInTheBlank', 'Essay', 'Coding']
export const typeLabels: Record<string, string> = {
  MultipleChoice: 'MC', FillInTheBlank: 'Fill', TrueOrFalse: 'T/F', Essay: 'Essay', Coding: 'Coding',
}

export function getLastName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.includes(',')) {
    return trimmed.split(',')[0].trim().toLowerCase()
  }
  const parts = trimmed.split(/\s+/)
  return parts[parts.length - 1].toLowerCase()
}
