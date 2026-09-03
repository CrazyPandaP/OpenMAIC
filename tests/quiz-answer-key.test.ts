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

  test('wrapped full-width single-letter key resolves via letter probe', () => {
    const answers = normalizeQuizAnswer({ answer: '（Ｂ）' }, VECTOR_OPTIONS);
    expect(answers).toEqual(['B']);
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

describe('grading of persisted keys: canonical-equal but not byte-identical', () => {
  const q: QuizQuestion = {
    id: 'q2',
    type: 'single',
    question: 'u·v = 0 → 关系?',
    options: RELATION_OPTIONS,
    answer: ['垂直 '], // 尾随空格变体：非字节相等
    hasAnswer: true,
    points: 10,
  };

  test('persisted whitespace-variant key resolves to the option value and grades correct', () => {
    const results = gradeChoiceQuestions([q], { q2: 'B' });
    expect(results[0].correct).toBe(true);
  });

  test('full-width variant of a persisted key resolves and grades correct', () => {
    const fw: QuizQuestion = { ...q, answer: ['（Ｂ）'] };
    const results = gradeChoiceQuestions([fw], { q2: 'B' });
    expect(results[0].correct).toBe(true);
  });
});

describe('ambiguous canonical matches fail closed', () => {
  const dupOptions = [
    { value: 'A', label: '(6, 2)' },
    { value: 'B', label: '(6,2)' }, // 规范化后与 A 的 label 相同 → 歧义
  ];
  const dupQuestion: QuizQuestion = {
    id: 'q3',
    type: 'single',
    question: '?',
    options: dupOptions,
    answer: ['(6, 2)'],
    hasAnswer: true,
    points: 10,
  };

  test('generation: ambiguous key stays untouched', () => {
    const answers = normalizeQuizAnswer({ answer: '(6, 2)' }, dupOptions);
    expect(answers).toEqual(['(6, 2)']);
  });

  test('grading: ambiguous key stays untouched (user picks either, still marked by exact match)', () => {
    const results = gradeChoiceQuestions([dupQuestion], { q3: 'A' });
    // 存储键与两个 label 都规范匹配 → 不可解析 → 选项值精确比对：
    // 用户选 A（值 'A'）≠ 存储键 '(6, 2)' → 判错（fail-closed 的代价，如实断言）
    expect(results[0].correct).toBe(false);
  });
});

describe('multiple-choice with persisted formatting-variant keys', () => {
  const multi: QuizQuestion = {
    id: 'q4',
    type: 'multiple',
    question: '选出正确的坐标',
    options: VECTOR_OPTIONS,
    answer: ['（Ａ）', 'c'], // 全角包裹 + 小写字母变体
    hasAnswer: true,
    points: 10,
  };

  test('resolves to option values and grades a fully-correct selection', () => {
    const resolved = (multi.answer ?? []).map((a) => resolveAnswerKeyToValue(multi, a));
    expect(resolved).toEqual(['A', 'C']);
    const results = gradeChoiceQuestions([multi], { q4: ['A', 'C'] });
    expect(results[0].correct).toBe(true);
  });
});
