export interface QuestionType {
  type: string
  gradeAnswer(
    questionContent: Record<string, unknown>,
    answerContent: Record<string, unknown>,
    points: number,
  ): { score: number | null; isCorrect: boolean | null }
}
