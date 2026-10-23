import rawBank from '../../../public/games/triviaire/questions.json';
import {describe, expect, it} from 'vitest';
import {challengeNumber, countdown, untilReset, utcDay} from '../../shared/daily';
import {correctCount, dailyDeck, LETTERS, newGame, phoneReplyMessage, PRIZES, questionFriendReply, reduceGame, removedChoices, restoreGame, secured, shareText, validateBank, validFriendReply, validQuestion, winnings, type Bank, type Choice, type FriendReply, type Game, type Question} from './engine';
const bank = validateBank(rawBank);
const day = '2026-09-05';
const answer = (g: Game, choice = g.deck[g.index].answer) => reduceGame(reduceGame(g, {type: 'select', choice}), {type: 'answer'});
const progress = (n: number) => {
  let game = newGame(bank, day);
  for (let i = 0; i < n; i++) game = reduceGame(answer(game), {type: 'next'});
  return game;
};
const dateAfter = (days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('question pack and daily scheduling', () => {
  it('imports the actual supplied sheet without duplicate questions within a difficulty level', () => {
    expect(bank.source.rows).toBeGreaterThanOrEqual(15);
    expect(bank.source.duplicatesRemoved).toBeGreaterThanOrEqual(0);
    expect(bank.questions).toHaveLength(bank.source.rows - bank.source.duplicatesRemoved - (bank.source.excludedRows?.length ?? 0));
    expect(bank.questions.every((q) => q.prompt.length >= 8)).toBe(true);
    if (bank.source.difficulty === 'Q1-Q15') {
      expect(bank.source.sheets).toHaveLength(15);
      expect(bank.source.sheets!.every((sheet) => sheet.questions > 0)).toBe(true);
      expect(bank.questions.every((q) => Number.isInteger(q.level) && q.level! >= 1 && q.level! <= 15)).toBe(true);
      expect(new Set(bank.questions.map((q) => `${q.level}:${q.prompt.toLowerCase()}`)).size).toBe(bank.questions.length);
    } else {
      expect(new Set(bank.questions.map((q) => q.prompt.toLowerCase())).size).toBe(bank.questions.length);
    }
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
  it('rotates through the available question pools before repeating', () => {
    if (bank.source.difficulty !== 'Q1-Q15') {
      const all = [];
      for (let d = 0; d < 400; d++) {
        const deck = dailyDeck(bank, dateAfter(d));
        expect(new Set(deck.map((q) => q.id)).size).toBe(15);
        all.push(...deck.map((q) => q.id));
      }
      expect(new Set(all.slice(0, bank.questions.length)).size).toBe(bank.questions.length);
      expect(all[bank.questions.length]).toBe(all[0]);
      return;
    }
    const base = dailyDeck(bank, day);
    expect(base.map((q) => q.level)).toEqual(PRIZES.map((_, i) => i + 1));
    const sampleDays = 100;
    const seen = PRIZES.map(() => new Set<string>());
    for (let d = 0; d < sampleDays; d++) {
      const deck = dailyDeck(bank, dateAfter(d));
      expect(new Set(deck.map((q) => q.id)).size).toBe(15);
      deck.forEach((q, i) => seen[i].add(q.id));
    }
    for (let i = 0; i < 15; i++) {
      const level = i + 1;
      const poolSize = bank.questions.filter((q) => q.level === level).length;
      expect(seen[i].size).toBe(Math.min(sampleDays, poolSize));
      expect(dailyDeck(bank, dateAfter(poolSize))[i].id).toBe(base[i].id);
    }
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

describe('custom Phone a friend replies', () => {
  const question: Question = {
    id: 'phone-1', level: 1, prompt: 'Which shape has four equal sides and four right angles?',
    choices: ['Triangle', 'Square', 'Circle', 'Pentagon'], answer: 1,
  };
  const reply: FriendReply = {
    answer: 'A square has four equal sides and four right angles.',
    hint: 'Think of a shape with four sides, rather than three or five.',
  };
  const fixtureBank: Bank = {
    version: 1, revision: 'before-replies',
    source: {url: 'https://example.com/questions', rows: 15, duplicatesRemoved: 0, difficulty: 'Q1-Q15'},
    questions: Array.from({length: 15}, (_, index) => ({...question, id: index ? `fixture-other-${index}` : question.id, level: index + 1})),
  };
  const initialGame = newGame(fixtureBank, day);
  const makeGame = (id: string, friendReply?: FriendReply): Game => ({
    ...initialGame, deck: [{...question, id, ...(friendReply ? {friendReply} : {})}, ...initialGame.deck.slice(1)],
  });
  const withReply = (game: Game, friendReply = reply): Bank => ({
    ...fixtureBank, revision: 'with-replies', questions: game.deck.map((q, index) => index ? q : {...q, friendReply}),
  });
  const call = (game: Game, currentBank?: Bank) => reduceGame(game, {type: 'lifeline', name: 'phone'}, currentBank);

  it('accepts either reply variant, both variants, and old questions without replies', () => {
    expect(validQuestion(question)).toBe(true);
    for (const friendReply of [{answer: reply.answer}, {hint: reply.hint}, reply]) {
      expect(validFriendReply(friendReply)).toBe(true);
      expect(validQuestion({...question, friendReply})).toBe(true);
      const game = makeGame('phone-1', friendReply);
      expect(validateBank(withReply(game, friendReply))).toBeTruthy();
      expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
    }
  });

  it.each([null, '', [], {}, {answer: ''}, {hint: ' '}, {answer: 42}, {hint: false}, {answer: 'A reply', hint: null}])('rejects malformed reply metadata: %j', (friendReply) => {
    expect(validFriendReply(friendReply)).toBe(false);
    expect(validQuestion({...question, friendReply})).toBe(false);
    const game = makeGame('phone-1');
    const invalid = {...game, deck: [{...question, friendReply}, ...game.deck.slice(1)]};
    expect(restoreGame(JSON.stringify(invalid), day)).toBeNull();
  });

  it('preserves reply text, question selection, and answer alignment when choices are shuffled', () => {
    const currentBank = {...fixtureBank, questions: fixtureBank.questions.map((q) => ({...q, friendReply: reply}))};
    const before = JSON.stringify(currentBank);
    const deck = dailyDeck(currentBank, day);
    expect(deck.map(({friendReply: _, ...q}) => q)).toEqual(initialGame.deck);
    expect(deck.some((q) => q.answer !== question.answer)).toBe(true);
    for (const q of deck) {
      expect(q.friendReply).toEqual(reply);
      expect(q.choices[q.answer]).toBe('Square');
    }
    expect(JSON.stringify(currentBank)).toBe(before);
  });

  it.each([
    ['phone-0', null, 'does not know'],
    ['phone-1', 1, 'fairly sure'],
    ['phone-2', 3, 'not certain'],
    ['phone-3', 1, 'not certain'],
    ['phone-4', 0, 'fairly sure'],
    ['phone-40', null, 'no answer'],
  ] as const)('preserves the original deterministic call for unsupported question %s', (id, choice, confidence) => {
    const game = makeGame(id);
    const expected = {at: 0, choice, confidence};
    expect(call(game).lifelines.phone).toEqual(expected);
    expect(call(game, fixtureBank).lifelines.phone).toEqual(expected);
  });

  it.each(['phone-1', 'phone-3'])('adds the answer message to a correct guess regardless of confidence: %s', (id) => {
    const baseline = call(makeGame(id)).lifelines.phone!;
    const game = call(makeGame(id, reply));
    expect(game.lifelines.phone).toEqual({...baseline, message: reply.answer});
    expect(game.lifelines.phone!.choice).toBe(game.deck[0].answer);
    expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
  });

  it.each(['phone-0', 'phone-2', 'phone-4'])('offers a clue without an answer for an unknown or incorrect guess: %s', (id) => {
    const game = call(makeGame(id, reply));
    expect(game.lifelines.phone).toEqual({at: 0, choice: null, confidence: 'does not know', message: reply.hint});
    expect(restoreGame(JSON.stringify(game), day)).toEqual(game);
  });

  it('uses the generic response when the matching variant is absent and always preserves voicemail', () => {
    for (const id of ['phone-1', 'phone-3']) {
      expect(call(makeGame(id, {hint: reply.hint})).lifelines.phone).toEqual(call(makeGame(id)).lifelines.phone);
    }
    for (const id of ['phone-0', 'phone-2', 'phone-4']) {
      expect(call(makeGame(id, {answer: reply.answer})).lifelines.phone).toEqual(call(makeGame(id)).lifelines.phone);
    }
    expect(call(makeGame('phone-40', reply)).lifelines.phone).toEqual({at: 0, choice: null, confidence: 'no answer'});
  });

  it('enriches an older shuffled save at call time without changing its gameplay snapshot', () => {
    const original = makeGame('phone-1');
    const currentBank = withReply(original);
    const oldSave = {...original, selected: 0 as Choice, deck: [{...question,
      choices: ['Circle', 'Triangle', 'Pentagon', 'Square'] as Question['choices'], answer: 3 as Choice}, ...original.deck.slice(1)]};
    const saved = restoreGame(JSON.stringify(oldSave), day)!;
    const before = JSON.stringify(saved);
    expect(saved.deck[0].friendReply).toBeUndefined();
    expect(questionFriendReply(saved.deck[0], currentBank)).toEqual(reply);
    const called = call(saved, currentBank);
    expect(called.lifelines.phone).toEqual({at: 0, choice: 3, confidence: 'fairly sure', message: reply.answer});
    expect(called.deck).toBe(saved.deck);
    expect(called.answers).toBe(saved.answers);
    expect(called.selected).toBe(saved.selected);
    expect(called.revision).toBe('before-replies');
    expect(winnings(called)).toBe(winnings(saved));
    expect(JSON.stringify(saved)).toBe(before);
  });

  it.each([
    {id: 'another-question'},
    {prompt: 'Which shape has three sides?'},
    {choices: ['Triangle', 'Square', 'Circle', 'Hexagon'] as Question['choices']},
    {answer: 0 as Choice},
  ])('does not borrow a reply when saved question content differs: %j', (change) => {
    const game = makeGame('phone-1');
    const currentBank = withReply(game);
    const changed = {...game, deck: [{...game.deck[0], ...change}, ...game.deck.slice(1)]};
    expect(questionFriendReply(changed.deck[0], currentBank)).toBeUndefined();
    expect(call(changed, currentBank)).toEqual(call(changed));
  });

  it('prefers matching current text and retains saved text when the bank has no matching reply', () => {
    const game = makeGame('phone-1', reply);
    const updated = {answer: 'Updated wording about the square.'};
    expect(questionFriendReply(game.deck[0], withReply(game, updated))).toEqual(updated);
    expect(questionFriendReply(game.deck[0])).toEqual(reply);
    expect(questionFriendReply(game.deck[0], {...fixtureBank, questions: fixtureBank.questions.slice(1)})).toEqual(reply);
    expect(questionFriendReply({...game.deck[0], prompt: 'An older saved prompt'}, withReply(game))).toEqual(reply);
  });

  it.each(['phone-1', 'phone-2'])('respects 50:50, selection, audience votes, and one-use behavior: %s', (id) => {
    let game = makeGame(id, reply);
    game = reduceGame(game, {type: 'lifeline', name: 'fifty'});
    game = reduceGame(game, {type: 'lifeline', name: 'audience'});
    game = reduceGame(game, {type: 'select', choice: game.deck[0].answer});
    const called = call(game);
    const phone = called.lifelines.phone!;
    expect(removedChoices(called)).not.toContain(phone.choice);
    expect(phone).toEqual(id === 'phone-1'
      ? {at: 0, choice: question.answer, confidence: 'fairly sure', message: reply.answer}
      : {at: 0, choice: null, confidence: 'does not know', message: reply.hint});
    expect(called.lifelines.fifty).toBe(game.lifelines.fifty);
    expect(called.lifelines.audience).toBe(game.lifelines.audience);
    expect(called.selected).toBe(game.selected);
    expect(call(called, withReply(called, {answer: 'Changed later', hint: 'Another clue'}))).toBe(called);
    const next = reduceGame(answer(called), {type: 'next'});
    const restored = restoreGame(JSON.stringify(next), day)!;
    expect(restored.lifelines.phone).toEqual(phone);
    expect(call(restored)).toBe(restored);
    expect(correctCount(restored)).toBe(1);
    expect(winnings(restored)).toBe(100);
  });

  it('does not rewrite already-used generic phone results when a bank gains custom replies', () => {
    for (const id of ['phone-0', 'phone-1', 'phone-2', 'phone-40']) {
      const called = call(makeGame(id));
      const saved = restoreGame(JSON.stringify(called), day)!;
      expect(call(saved, withReply(saved))).toBe(saved);
      expect(saved.lifelines.phone!.message).toBeUndefined();
    }
  });

  it('adds display-only text to old correct and unknown calls while leaving wrong guesses and voicemail generic', () => {
    for (const [id, expected] of [
      ['phone-0', reply.hint], ['phone-1', reply.answer], ['phone-3', reply.answer],
      ['phone-2', undefined], ['phone-4', undefined], ['phone-40', undefined],
    ]) {
      const game = call(makeGame(id!));
      const saved = restoreGame(JSON.stringify(game), day)!;
      const before = JSON.stringify(saved);
      expect(phoneReplyMessage(saved.deck[0], saved.lifelines.phone!, withReply(saved))).toBe(expected);
      expect(saved.lifelines.phone!.message).toBeUndefined();
      expect(JSON.stringify(saved)).toBe(before);
      expect(call(saved, withReply(saved))).toBe(saved);
    }
  });

  it('keeps persisted reply text ahead of later content updates', () => {
    for (const id of ['phone-0', 'phone-1']) {
      const game = call(makeGame(id, reply));
      const phone = game.lifelines.phone!;
      const updatedBank = withReply(game, {answer: 'An updated answer', hint: 'An updated clue'});
      expect(phoneReplyMessage(game.deck[0], phone, updatedBank)).toBe(phone.message);
      expect(phoneReplyMessage(game.deck[0], phone)).toBe(phone.message);
    }
  });

  it('enriches legacy display only when question guards and the matching variant are available', () => {
    const correct = call(makeGame('phone-1'));
    const unknown = call(makeGame('phone-0'));
    expect(phoneReplyMessage(correct.deck[0], correct.lifelines.phone!)).toBeUndefined();
    expect(phoneReplyMessage(correct.deck[0], correct.lifelines.phone!, withReply(correct, {hint: reply.hint}))).toBeUndefined();
    expect(phoneReplyMessage(unknown.deck[0], unknown.lifelines.phone!, withReply(unknown, {answer: reply.answer}))).toBeUndefined();
    for (const game of [correct, unknown]) {
      const currentBank = withReply(game);
      const mismatchedBank = {...currentBank, questions: currentBank.questions.map((q) => ({...q, prompt: 'Changed prompt'}))};
      expect(phoneReplyMessage(game.deck[0], game.lifelines.phone!, mismatchedBank)).toBeUndefined();
    }
  });

  it('rejects invalid persisted messages and messages paired with voicemail or an incorrect recommendation', () => {
    const game = call(makeGame('phone-1', reply));
    const phone = game.lifelines.phone!;
    for (const message of [null, '', ' ', 42, false, {}]) {
      const corrupted = {...game, lifelines: {...game.lifelines, phone: {...phone, message}}};
      expect(restoreGame(JSON.stringify(corrupted), day)).toBeNull();
    }
    for (const change of [{choice: null, confidence: 'no answer'}, {choice: 0, confidence: 'fairly sure'}]) {
      const corrupted = {...game, lifelines: {...game.lifelines, phone: {...phone, ...change}}};
      expect(restoreGame(JSON.stringify(corrupted), day)).toBeNull();
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
