import { describe, expect, test } from 'vitest';

import { gradeChoiceQuestions, resolveAnswerKeyToValue } from '@/lib/quiz/grading';
import { normalizeQuizAnswer } from '../packages/@openmaic/generation/src/scene-generator';
import type { QuizQuestion } from '@/lib/types/stage';

const VECTOR_OPTIONS = [
  { value: 'A', label: '(6, 2)' },
  { value: 'B', label: '(2, -4)' },
  { value: 'C', label: '(6, -3)' },
  { value: 'D', label: '(6, -4)' },
];

const RELATION_OPTIONS = [
  { value: 'A', label: '平行' },
  { value: 'B', label: '垂直' },
  { value: 'C', label: '同向' },
  { value: 'D', label: '反向' },
];

describe('normalizeQuizAnswer (generation side)', () => {
  test('letter answer resolves to itself', () => {
    const answers = normalizeQuizAnswer({ answer: 'A' }, VECTOR_OPTIONS);
    expect(answers).toEqual(['A']);
  });

  test('content answer resolves to the matching option value', () => {
    const answers = normalizeQuizAnswer({ answer: '(6, 2)' }, VECTOR_OPTIONS);
    expect(answers).toEqual(['A']);
  });

  test('full-width formatting variant resolves via NFKC', () => {
    const answers = normalizeQuizAnswer({ answer: '（６，２）' }, VECTOR_OPTIONS);
    expect(answers).toEqual(['A']);
  });

  test('content without inner spaces resolves to the spaced option', () => {
    const answers = normalizeQuizAnswer({ answer: '(6,2)' }, VECTOR_OPTIONS);
    expect(answers).toEqual(['A']);
  });

  test('trailing-space Chinese content resolves to the trimmed option', () => {
    const answers = normalizeQuizAnswer({ answer: '垂直 ' }, RELATION_OPTIONS);
    expect(answers).toEqual(['B']);
  });

  test('multiple letter answers pass through', () => {
    const answers = normalizeQuizAnswer({ answer: ['A', 'C'] }, VECTOR_OPTIONS);
    expect(answers).toEqual(['A', 'C']);
  });

  test('unknown answer passes through untouched', () => {
    const answers = normalizeQuizAnswer({ answer: '正交' }, RELATION_OPTIONS);
    expect(answers).toEqual(['正交']);
  });

  test('missing options passes answers through untouched', () => {
    const answers = normalizeQuizAnswer({ answer: '(6, 2)' }, undefined);
    expect(answers).toEqual(['(6, 2)']);
  });
});

describe('resolveAnswerKeyToValue (grading side, fixes already-generated courses)', () => {
  const question = {
    id: 'q1',
    type: 'single' as const,
    question: 'a+b=?',
    options: VECTOR_OPTIONS,
    answer: ['(6,2)'], // LLM wrote content variant instead of the value "A"
    hasAnswer: true,
    points: 10,
  };

  test('content-variant key resolves to the matching option value', () => {
    expect(resolveAnswerKeyToValue(question, '(6,2)')).toBe('A');
  });

  test('exact value key resolves to itself', () => {
    expect(resolveAnswerKeyToValue(question, 'A')).toBe('A');
  });

  test('ambiguous key stays untouched', () => {
    expect(resolveAnswerKeyToValue(question, '正交')).toBe('正交');
  });
});

describe('gradeChoiceQuestions end-to-end with a content-variant key', () => {
  test('user picking the correct option is graded correct', () => {
    const question: QuizQuestion = {
      id: 'q1',
      type: 'single',
      question: '已知向量 a = (2, 3)，向量 b = (4, -1)，则向量 a + b 的坐标是?',
      options: VECTOR_OPTIONS,
      answer: ['(6,2)'],
      hasAnswer: true,
      points: 10,
    };
    const results = gradeChoiceQuestions([question], { q1: 'A' });
    expect(results[0].correct).toBe(true);
    expect(results[0].status).toBe('correct');
  });
});
