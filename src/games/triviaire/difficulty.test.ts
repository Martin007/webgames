import {describe, expect, it} from 'vitest';
import {dailyDeck, LEVELS, PRIZES, validateBank, type Bank, type Choice, type Question} from './engine';

const makeQuestion = (level: number, n: number): Question => ({
  id: `q${level}-${n}`,
  level,
  prompt: `Difficulty ${level} question ${n}?`,
  choices: [`L${level} option A ${n}`, `L${level} option B ${n}`, `L${level} option C ${n}`, `L${level} option D ${n}`],
  answer: (n % 4) as Choice,
});
const bank: Bank = {
  version: 1,
  revision: 'difficulty-test',
  source: {url: 'https://example.test/sheet', rows: 45, duplicatesRemoved: 0, difficulty: 'Q1-Q15'},
  questions: LEVELS.flatMap((level) => [0, 1, 2].map((n) => makeQuestion(level, n))),
};

describe('Q1-Q15 difficulty decks', () => {
  it('uses exactly one matching difficulty level for every prize slot', () => {
    const deck = dailyDeck(validateBank(bank), '2026-09-05');
    expect(deck).toHaveLength(PRIZES.length);
    expect(deck.map((q) => q.level)).toEqual(LEVELS);
    expect(deck[0].level).toBe(1);
    expect(deck[14].level).toBe(15);
  });

  it('is deterministic and rotates independently through every level pool', () => {
    const validated = validateBank(bank);
    expect(dailyDeck(validated, '2026-09-05')).toEqual(dailyDeck(validated, '2026-09-05'));
    for (const level of LEVELS) {
      const ids = ['2026-09-05', '2026-09-06', '2026-09-07'].map((day) => dailyDeck(validated, day)[level - 1].id);
      expect(new Set(ids).size).toBe(3);
      expect(dailyDeck(validated, '2026-09-08')[level - 1].id).toBe(ids[0]);
    }
  });

  it('rejects a tabbed pack when any difficulty pool is missing', () => {
    const missingQ15 = {...bank, questions: bank.questions.filter((q) => q.level !== 15)};
    expect(() => validateBank(missingQ15)).toThrow(/every Q1-Q15/);
  });
});
