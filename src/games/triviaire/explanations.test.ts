import {describe, expect, it} from 'vitest';
import {dailyDeck, newGame, questionExplanation, restoreGame, validateBank, validExplanation, validQuestion, type Bank, type Explanation, type Question} from './engine';

const explanation: Explanation = {
  summary: 'A square has four equal sides and four right angles.',
  choices: [
    'A triangle has three sides, so it cannot be a square.',
    'A square has exactly four equal sides and four right angles.',
    'A circle has no straight sides or corners.',
    'A pentagon has five sides.',
  ],
  sources: [{title: 'Reference', url: 'https://example.com/square'}],
};
const question: Question = {
  id: 'fixture-square',
  prompt: 'Which shape has four equal sides and four right angles?',
  choices: ['Triangle', 'Square', 'Circle', 'Pentagon'],
  answer: 1,
};
const bank: Bank = {
  version: 1, revision: 'fixture',
  source: {url: 'https://example.com/questions', rows: 15, duplicatesRemoved: 0, difficulty: 'Q1-Q15'},
  questions: Array.from({length: 15}, (_, index) => ({...question, id: `fixture-${index}`, level: index + 1})),
};
const explainedBank: Bank = {...bank, revision: 'fixture-explanations', questions: bank.questions.map((q) => ({...q, explanation}))};
const day = '2026-10-21';

describe('optional question explanations', () => {
  it('accepts older packs and saves without explanations, while validating new fields', () => {
    expect(validateBank(bank)).toBe(bank);
    expect(validateBank(explainedBank)).toBe(explainedBank);
    const oldGame = newGame(bank, day);
    expect(restoreGame(JSON.stringify(oldGame), day)).toEqual(oldGame);
    const newGameWithExplanations = newGame(explainedBank, day);
    expect(restoreGame(JSON.stringify(newGameWithExplanations), day)).toEqual(newGameWithExplanations);
    expect(questionExplanation(oldGame.deck[0], bank)).toBeUndefined();
  });

  it.each([
    '',
    {summary: ' ', choices: explanation.choices},
    {...explanation, choices: explanation.choices.slice(0, 3)},
    {...explanation, choices: ['Valid', 'Valid', ' ', 'Valid']},
    {...explanation, sources: [{title: 'Unsafe', url: 'javascript:alert(1)'}]},
    {...explanation, sources: [{title: 'Unsafe', url: 'data:text/html,test'}]},
    {...explanation, sources: [{title: 'Missing address', url: 'https://'}]},
  ])('rejects malformed explanation data: %j', (invalid) => {
    expect(validExplanation(invalid)).toBe(false);
    expect(validQuestion({...question, explanation: invalid})).toBe(false);
  });

  it('keeps each reason with its answer while preserving the selected questions and answer order', () => {
    const before = JSON.stringify(explainedBank);
    const plainDeck = dailyDeck(bank, day);
    const explainedDeck = dailyDeck(explainedBank, day);
    expect(explainedDeck.map(({explanation: _, ...q}) => q)).toEqual(plainDeck);
    expect(explainedDeck.some((q) => q.choices.some((choice, i) => choice !== question.choices[i]))).toBe(true);
    for (const q of explainedDeck) {
      expect(q.choices[q.answer]).toBe('Square');
      q.choices.forEach((choice, index) => {
        expect(q.explanation!.choices[index]).toBe(explanation.choices[question.choices.indexOf(choice)]);
      });
    }
    expect(JSON.stringify(explainedBank)).toBe(before);
  });

  it('adds current explanations to old saved questions without changing the saved game', () => {
    const game = newGame(bank, day);
    const before = JSON.stringify(game);
    for (const q of game.deck) {
      const resolved = questionExplanation(q, explainedBank)!;
      expect(resolved.summary).toBe(explanation.summary);
      q.choices.forEach((choice, index) => {
        expect(resolved.choices[index]).toBe(explanation.choices[question.choices.indexOf(choice)]);
      });
    }
    expect(JSON.stringify(game)).toBe(before);
    expect(game.revision).toBe('fixture');
  });

  it.each([
    {id: 'different-question'},
    {prompt: 'A different prompt with the same answers?'},
    {choices: ['Triangle', 'Square', 'Circle', 'Hexagon'] as Question['choices']},
    {answer: 0 as const},
  ])('does not borrow explanations when saved question content differs: %j', (change) => {
    const original = bank.questions[0];
    expect(questionExplanation({...original, ...change}, explainedBank)).toBeUndefined();
  });

  it('keeps a saved explanation available when its question is removed or changed in the current pack', () => {
    const saved = {...bank.questions[0], explanation};
    expect(questionExplanation(saved, {...bank, questions: bank.questions.slice(1)})).toBe(explanation);
    const changed = {...explainedBank, questions: explainedBank.questions.map((q) => ({...q, prompt: 'Changed question'}))};
    expect(questionExplanation(saved, changed)).toBe(explanation);
  });

  it('uses a corrected current explanation when all saved question content still matches', () => {
    const saved = {...bank.questions[0], explanation: {...explanation, summary: 'An older summary.'}};
    expect(questionExplanation(saved, explainedBank)?.summary).toBe(explanation.summary);
  });
});
