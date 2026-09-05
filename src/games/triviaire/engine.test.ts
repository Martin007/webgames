import rawBank from '../../../public/games/triviaire/questions.json';
import {describe, expect, it} from 'vitest';
import {challengeNumber, countdown, untilReset, utcDay} from '../../shared/daily';
import {correctCount, dailyDeck, LETTERS, newGame, PRIZES, reduceGame, removedChoices, restoreGame, secured, shareText, validateBank, winnings, type Choice, type Game} from './engine';
const bank = validateBank(rawBank);
const day = '2026-09-05';
const answer = (g: Game, choice = g.deck[g.index].answer) => reduceGame(reduceGame(g, {type: 'select', choice}), {type: 'answer'});
const progress = (n: number) => {
  let game = newGame(bank, day);
  for (let i = 0; i < n; i++) game = reduceGame(answer(game), {type: 'next'});
  return game;
};

describe('question pack and daily scheduling', () => {
  it('imports the actual supplied sheet without duplicate questions', () => {
    expect(bank.source.rows).toBeGreaterThanOrEqual(15);
    expect(bank.source.duplicatesRemoved).toBeGreaterThanOrEqual(0);
    expect(bank.questions).toHaveLength(bank.source.rows - bank.source.duplicatesRemoved - (bank.source.excludedRows?.length ?? 0));
    expect(bank.questions.every((q) => q.prompt.length >= 8)).toBe(true);
    expect(new Set(bank.questions.map((q) => q.prompt.toLowerCase())).size).toBe(bank.questions.length);
    expect(bank.questions.some((q) => Boolean(q.contributor))).toBe(true);
  });
  it('uses midnight UTC regardless of the player’s timezone', () => {
    expect(utcDay(new Date('2026-09-06T01:59:59+02:00'))).toBe(day);
    expect(utcDay(new Date('2026-09-06T02:00:00+02:00'))).toBe('2026-09-06');
    expect(challengeNumber(day)).toBe(1);
    expect(challengeNumber('2026-09-06')).toBe(2);
    expect(untilReset(new Date('2026-09-05T23:59:59Z'))).toBe(1000);
    expect(countdown(86_399_000)).toBe('23:59:59');
  });
  it('is deterministic, does not mutate the bank, and keeps correct answers aligned', () => {
    const before = JSON.stringify(bank);
    const deck = dailyDeck(bank, day);
    expect(deck).toEqual(dailyDeck(bank, day));
    expect(new Set(deck.map((q) => q.id)).size).toBe(15);
    expect(JSON.stringify(bank)).toBe(before);
    for (const q of deck) {
      const original = bank.questions.find((item) => item.id === q.id)!;
      expect(q.choices[q.answer]).toBe(original.choices[original.answer]);
    }
  });
  it('exhausts the pack before repeating and has no duplicates within a day', () => {
    const all = [];
    for (let d = 0; d < 400; d++) {
      const date = new Date(Date.parse(`${day}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
      const deck = dailyDeck(bank, date);
      expect(new Set(deck.map((q) => q.id)).size).toBe(15);
      all.push(...deck.map((q) => q.id));
    }
    expect(new Set(all.slice(0, bank.questions.length)).size).toBe(bank.questions.length);
    expect(all[bank.questions.length]).toBe(all[0]);
  });
  it('rejects invalid packs and dates', () => {
    expect(() => validateBank({...bank, version: 2})).toThrow();
    expect(() => validateBank({...bank, questions: bank.questions.slice(0, 14)})).toThrow();
    expect(() => validateBank({...bank, questions: [...bank.questions, bank.questions[0]]})).toThrow();
    expect(() => dailyDeck(bank, 'not-a-date')).toThrow();
    expect(() => dailyDeck(bank, '2026-02-31')).toThrow();
  });
});

describe('the 15-question prize ladder', () => {
  it('requires selection, then explicit final-answer confirmation', () => {
    const game = newGame(bank, day);
    expect(reduceGame(game, {type: 'answer'})).toBe(game);
    const selected = reduceGame(game, {type: 'select', choice: 0});
    expect(selected.answers).toEqual([]);
    expect(selected.phase).toBe('question');
    expect(reduceGame(game, {type: 'select', choice: 8 as Choice})).toBe(game);
  });
  it('wins exactly one million after 15 correct answers and cannot be replayed', () => {
    const game = progress(15);
    expect(game.phase).toBe('result');
    expect(game.status).toBe('won');
    expect(correctCount(game)).toBe(15);
    expect(winnings(game)).toBe(1_000_000);
    for (const action of [{type: 'answer'}, {type: 'next'}, {type: 'walk'}, {type: 'lifeline', name: 'fifty'}] as const) expect(reduceGame(game, action)).toBe(game);
  });
  it.each(PRIZES.map((_, i) => [i]))('awards the correct safety net when question %i is missed', (index) => {
    const game = progress(index);
    const wrong = ((game.deck[game.index].answer + 1) % 4) as Choice;
    const lost = answer(game, wrong);
    expect(lost.status).toBe('lost');
    expect(lost.phase).toBe('reveal');
    expect(winnings(lost)).toBe(secured(index));
    expect(reduceGame(lost, {type: 'answer'})).toBe(lost);
    const result = reduceGame(lost, {type: 'next'});
    expect(result.phase).toBe('result');
    expect(restoreGame(JSON.stringify(result), day)).toEqual(result);
  });
  it.each(PRIZES.map((_, i) => [i]))('walks away with the last earned prize after %i correct answers', (n) => {
    const walked = reduceGame(progress(n), {type: 'walk'});
    expect(walked.status).toBe('walked');
    expect(winnings(walked)).toBe(n === 0 ? 0 : PRIZES[n - 1]);
    expect(restoreGame(JSON.stringify(walked), day)).toEqual(walked);
  });
  it('does not permit walking away after locking a wrong answer', () => {
    const game = newGame(bank, day);
    const lost = answer(game, ((game.deck[0].answer + 1) % 4) as Choice);
    expect(reduceGame(lost, {type: 'walk'})).toBe(lost);
  });
});

describe('lifelines', () => {
  it.each([['fifty','audience','phone'], ['audience','phone','fifty'], ['phone','fifty','audience']] as const)('works in the order %s / %s / %s', (first, second, third) => {
    let game = newGame(bank, day);
    for (const name of [first, second, third]) {
      const before = game;
      game = reduceGame(game, {type: 'lifeline', name});
      expect(game).toEqual(reduceGame(before, {type: 'lifeline', name}));
      expect(reduceGame(game, {type: 'lifeline', name})).toBe(game);
      expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
    }
    expect(removedChoices(game)).toHaveLength(2);
    expect(removedChoices(game)).not.toContain(game.deck[0].answer);
    expect(game.lifelines.audience!.votes.reduce((a, b) => a + b, 0)).toBe(100);
    const used = reduceGame(answer(game), {type: 'next'});
    expect(removedChoices(used)).toEqual([]);
    expect(reduceGame(used, {type: 'lifeline', name: 'fifty'})).toBe(used);
  });
  it('clears a selected answer that 50:50 removes and prevents selecting it again', () => {
    const game = newGame(bank, day);
    const preview = reduceGame(game, {type: 'lifeline', name: 'fifty'});
    const removed = preview.lifelines.fifty!.removed[0];
    const next = reduceGame(reduceGame(game, {type: 'select', choice: removed}), {type: 'lifeline', name: 'fifty'});
    expect(next.selected).toBe(null);
    expect(reduceGame(next, {type: 'select', choice: removed})).toBe(next);
  });
  it('keeps simulated hints deterministic and respects prior 50:50 removals over 120 dates', () => {
    for (let n = 0; n < 120; n++) {
      const date = new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      let game = reduceGame(newGame(bank, date), {type: 'lifeline', name: 'fifty'});
      game = reduceGame(game, {type: 'lifeline', name: 'audience'});
      game = reduceGame(game, {type: 'lifeline', name: 'phone'});
      for (const index of removedChoices(game)) expect(game.lifelines.audience!.votes[index]).toBe(0);
      expect(removedChoices(game)).not.toContain(game.lifelines.phone!.choice);
      expect(game.lifelines.audience!.votes.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe('persistence and sharing', () => {
  it('restores every question/reveal state without requiring the original bank revision', () => {
    let game = newGame(bank, day);
    for (let i = 0; i < 15; i++) {
      expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
      game = answer(game);
      expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
      game = reduceGame(game, {type: 'next'});
    }
    expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
  });
  it('rejects corrupt, mismatched, and structurally inconsistent saves', () => {
    const game = newGame(bank, day);
    for (const value of [null, '', '{broken', '{}', JSON.stringify({...game, version: 9}), JSON.stringify({...game, index: 99}), JSON.stringify({...game, deck: []}), JSON.stringify({...game, phase: 'result'}), JSON.stringify({...game, lifelines: {}}), JSON.stringify({...game, answers: [0,0,0]})]) expect(restoreGame(value, day)).toBe(null);
    expect(restoreGame(JSON.stringify(game), '2026-09-06')).toBe(null);
  });
  it('shares a spoiler-free 15-cell result', () => {
    const game = reduceGame(progress(7), {type: 'walk'});
    const text = shareText(game);
    expect(text).toContain('$4,000');
    expect(text).toContain('7/15');
    expect(text).toContain('Walked away');
    expect(text.match(/🟩|🟥|⬜/gu)).toHaveLength(15);
    for (const q of game.deck) {expect(text).not.toContain(q.prompt); expect(text).not.toContain(q.id);}
    expect(LETTERS).toEqual(['A','B','C','D']);
  });
});
