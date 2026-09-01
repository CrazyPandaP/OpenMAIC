import type { QuizQuestion } from '@/lib/types/stage';

export interface QuestionResult {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Whether a question is graded as open text (AI) rather than by exact
 * answer-key match. Classification is by the explicit `type` only: an
 * unanswered choice question (empty `answer`) is still a choice question and
 * must not be re-routed to AI grading. `hasAnswer` does not override the type.
 */
export function isShortAnswer(q: QuizQuestion): boolean {
  return q.type === 'short_answer';
}

/** Grade choice questions locally. Returns results only for non-short-answer questions. */
// Canonical form for tolerant answer-key matching: NFKC (full-width →
// half-width), strip all whitespace, lowercase. AI-generated answer keys
// often differ from option values by exactly these cosmetics.
function canonAnswerKey(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/**
 * Resolve a stored answer-key entry to an option value. AI-generated keys
 * sometimes hold the option CONTENT ("(6, 2)", possibly with different
 * spacing/width) instead of the option VALUE ("A"). If the entry canonically
 * equals exactly one option's value, keep it; if it equals exactly one
 * option's label, map to that option's value; otherwise leave it untouched
 * (ambiguous or truly unknown keys must not be silently re-pointed).
 */
export function resolveAnswerKeyToValue(q: QuizQuestion, answer: string): string {
  const opts = q.options ?? [];
  if (opts.length === 0) return answer;
  const ca = canonAnswerKey(answer);
  if (opts.some((o) => canonAnswerKey(o.value) === ca)) return answer;
  const labelMatches = opts.filter((o) => canonAnswerKey(o.label) === ca);
  if (labelMatches.length === 1) return labelMatches[0].value;
  return answer;
}

export function gradeChoiceQuestions(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
): QuestionResult[] {
  return questions
    .filter((q) => !isShortAnswer(q))
    .map((q) => {
      const pts = q.points ?? 1;
      const userAnswer = toArray(answers[q.id]).map((a) => resolveAnswerKeyToValue(q, a));
      const correctAnswer = toArray(q.answer).map((a) => resolveAnswerKeyToValue(q, a));
      const correct = arraysEqual(userAnswer, correctAnswer);
      return {
        questionId: q.id,
        correct,
        status: correct ? ('correct' as const) : ('incorrect' as const),
        earned: correct ? pts : 0,
      };
    });
}
