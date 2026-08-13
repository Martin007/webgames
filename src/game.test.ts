import {describe, expect, it} from 'vitest';
import {
  findAnswerIndex,
  getChallengeNumber,
  getDailyQuestions,
  getShareText,
  matchesAnswer,
  normalizeGuess,
  patternToRegex,
  validateQuestionsFile,
} from './game';
import type {Answer, Question} from './types';

const answer = (patterns: string[]): Answer => ({
  points: 10,
  display: 'TEST',
  patterns,
});

describe('question matching', () => {
  it('normalizes case and repeated spaces', () => {
    expect(normalizeGuess('  ICE    Cream ')).toBe('ice cream');
    expect(matchesAnswer(' ice   cream ', answer(['ICE CREAM']))).toBe(true);
  });

  it('makes every lowercase character optional', () => {
    const regex = patternToRegex('COOKies');
    expect(regex.test('cook')).toBe(true);
    expect(regex.test('cookies')).toBe(true);
    expect(regex.test('cookis')).toBe(true);
    expect(regex.test('coo')).toBe(false);
  });

  it('omits a separator next to optional text', () => {
    const optionalPrefix = answer(['family TIES']);
    expect(matchesAnswer('ties', optionalPrefix)).toBe(true);
    expect(matchesAnswer('family ties', optionalPrefix)).toBe(true);
    expect(matchesAnswer('familyties', optionalPrefix)).toBe(true);
  });

  it('uses every accepted synonym and returns its board slot', () => {
    const question: Question = {
      id: 'q1',
      question: 'Food?',
      answers: [
        {
          points: 9,
          display: 'FRENCH FRIES',
          patterns: ['FRENCH FRies', 'POTATO'],
        },
      ],
    };
    expect(findAnswerIndex('potato', question)).toBe(0);
  });
});

describe('daily challenge', () => {
  const questions: Question[] = Array.from({length: 20}, (_, index) => ({
    id: `q${index}`,
    question: `Question ${index}`,
    answers: [answer(['ANSWER'])],
  }));

  it('selects four deterministic, unique questions for a challenge', () => {
    const first = getDailyQuestions(questions, 1);
    const again = getDailyQuestions(questions, 1);
    expect(first).toHaveLength(4);
    expect(new Set(first.map(({id}) => id))).toHaveLength(4);
    expect(first.map(({id}) => id)).toEqual(again.map(({id}) => id));
  });

  it('uses every question before repeating', () => {
    const cycle = Array.from({length: 5}, (_, index) =>
      getDailyQuestions(questions, index + 1),
    ).flat();

    expect(new Set(cycle.map(({id}) => id))).toHaveLength(20);
    expect(getDailyQuestions(questions, 6).map(({id}) => id)).toEqual(
      getDailyQuestions(questions, 1).map(({id}) => id),
    );
  });

  it('wraps only after the final remaining question has been used', () => {
    const shortSet = questions.slice(0, 5);
    const first = getDailyQuestions(shortSet, 1);
    const second = getDailyQuestions(shortSet, 2);

    expect(new Set([...first, ...second].map(({id}) => id))).toHaveLength(5);
    expect(second[0].id).not.toBe(first[0].id);
  });

  it('starts Challenge #1 on 2026-08-14 UTC', () => {
    expect(getChallengeNumber(new Date('2026-08-13T00:00:00.000Z'))).toBe(1);
    expect(getChallengeNumber(new Date('2026-08-14T00:00:00.000Z'))).toBe(1);
    expect(getChallengeNumber(new Date('2026-08-15T00:00:00.000Z'))).toBe(2);
  });
});

describe('data validation and sharing', () => {
  it('rejects unsupported formats', () => {
    expect(() =>
      validateQuestionsFile({formatVersion: 2, questions: []}),
    ).toThrow(/Unsupported/);
  });

  it('builds a spoiler-free score grid', () => {
    const text = getShareText(
      123,
      [
        {
          questionId: 'q1',
          points: 80,
          possible: 100,
          foundCount: 4,
          answerCount: 5,
        },
        {
          questionId: 'q2',
          points: 40,
          possible: 100,
          foundCount: 2,
          answerCount: 5,
        },
        {
          questionId: 'q3',
          points: 10,
          possible: 100,
          foundCount: 1,
          answerCount: 5,
        },
      ],
      130,
    );
    expect(text).toContain('Feudle #123  130/300');
    expect(text).toContain('🟩🟨⬛');
    expect(text).not.toContain('q1');
  });
});
