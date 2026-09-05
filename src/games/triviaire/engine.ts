import {challengeNumber} from '../../shared/daily';

export const PRIZES = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000] as const;
export const STORAGE_PREFIX = 'triviaire:daily:';
export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export type Choice = 0 | 1 | 2 | 3;
export interface Question {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
  answer: Choice;
  sourceRows?: number[];
  source?: string;
  contributor?: string;
}
export interface Bank {
  version: 1;
  revision: string;
  source: {url: string; rows: number; duplicatesRemoved: number; excludedRows?: {row: number; reason: string}[]; difficulty: 'unrated'};
  questions: Question[];
}
export interface Lifelines {
  fifty: {at: number; removed: Choice[]} | null;
  audience: {at: number; votes: number[]} | null;
  phone: {at: number; choice: Choice; confidence: 'fairly sure' | 'not certain'} | null;
}
export interface Game {
  version: 1;
  day: string;
  revision: string;
  deck: Question[];
  index: number;
  answers: Choice[];
  selected: Choice | null;
  phase: 'question' | 'reveal' | 'result';
  status: 'playing' | 'won' | 'lost' | 'walked';
  lifelines: Lifelines;
}
export type Action =
  | {type: 'select'; choice: Choice}
  | {type: 'answer'}
  | {type: 'next'}
  | {type: 'walk'}
  | {type: 'lifeline'; name: keyof Lifelines};

export const money = (amount: number): string => `$${amount.toLocaleString('en-US')}`;
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random(seed: number): () => number {
  return () => {
    seed += 0x6d2b79f5;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const isChoice = (n: unknown): n is Choice => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 4;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function validQuestion(v: unknown): v is Question {
  if (!isRecord(v)) return false;
  return isText(v.id) && isText(v.prompt) && Array.isArray(v.choices) && v.choices.length === 4
    && v.choices.every(isText) && new Set(v.choices.map((c) => c.trim().toLowerCase())).size === 4 && isChoice(v.answer);
}
export function validateBank(value: unknown): Bank {
  if (!isRecord(value) || value.version !== 1 || !isText(value.revision)
    || !isRecord(value.source) || !isText(value.source.url)
    || !Array.isArray(value.questions) || value.questions.length < PRIZES.length
    || !value.questions.every(validQuestion)) throw new Error('The question pack is invalid or incomplete.');
  const qs = value.questions as Question[];
  if (new Set(qs.map((q) => q.id)).size !== qs.length
    || new Set(qs.map((q) => q.prompt.trim().toLowerCase())).size !== qs.length) {
    throw new Error('The question pack contains duplicate questions.');
  }
  return value as unknown as Bank;
}
/** A fixed, ID-based order exhausts the bank before wrapping. Answer order is seeded per day. */
export function dailyDeck(bank: Bank, day: string): Question[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (!Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)) throw new Error('Invalid challenge date.');
  if (bank.questions.length < PRIZES.length) throw new Error('At least 15 questions are required.');
  const sorted = [...bank.questions].sort((a, b) =>
    hash(`triviaire-v1:${a.id}`) - hash(`triviaire-v1:${b.id}`) || (a.id < b.id ? -1 : 1));
  const start = ((challengeNumber(day) - 1) * PRIZES.length) % sorted.length;
  return Array.from({length: PRIZES.length}, (_, i) => {
    const q = sorted[(start + i) % sorted.length];
    const order = shuffled<Choice>([0, 1, 2, 3], random(hash(`${day}:${q.id}:choices`)));
    return {...q, choices: order.map((j) => q.choices[j]) as Question['choices'], answer: order.indexOf(q.answer) as Choice};
  });
}
export const newGame = (bank: Bank, day: string): Game => ({
  version: 1, day, revision: bank.revision, deck: dailyDeck(bank, day), index: 0,
  answers: [], selected: null, phase: 'question', status: 'playing',
  lifelines: {fifty: null, audience: null, phone: null},
});
export const removedChoices = (g: Game): Choice[] => g.lifelines.fifty?.at === g.index ? g.lifelines.fifty.removed : [];
export const correctCount = (g: Game): number => g.answers.filter((a, i) => a === g.deck[i].answer).length;
export const secured = (correct: number): number => correct >= 10 ? 32000 : correct >= 5 ? 1000 : 0;
export const winnings = (g: Game): number => g.status === 'lost' ? secured(correctCount(g)) : PRIZES[correctCount(g) - 1] ?? 0;

export function reduceGame(g: Game, action: Action): Game {
  if (action.type === 'next') {
    if (g.phase !== 'reveal') return g;
    return g.status !== 'playing' ? {...g, phase: 'result'} : {...g, index: g.index + 1, selected: null, phase: 'question'};
  }
  if (g.status !== 'playing' || g.phase !== 'question') return g;
  const q = g.deck[g.index];
  if (action.type === 'select') {
    return isChoice(action.choice) && !removedChoices(g).includes(action.choice) ? {...g, selected: action.choice} : g;
  }
  if (action.type === 'answer') {
    if (g.selected === null || removedChoices(g).includes(g.selected)) return g;
    return {...g, answers: [...g.answers, g.selected], phase: 'reveal',
      status: g.selected !== q.answer ? 'lost' : g.index === 14 ? 'won' : 'playing'};
  }
  if (action.type === 'walk') return {...g, status: 'walked', phase: 'result'};
  if (g.lifelines[action.name]) return g;
  const rng = random(hash(`${g.day}:${q.id}:${action.name}`));
  const available = ([0, 1, 2, 3] as Choice[]).filter((c) => !removedChoices(g).includes(c));
  const wrong = available.filter((c) => c !== q.answer);
  if (action.name === 'fifty') {
    const removed = shuffled(wrong, rng).slice(0, 2);
    return {...g, selected: g.selected !== null && removed.includes(g.selected) ? null : g.selected,
      lifelines: {...g.lifelines, fifty: {at: g.index, removed}}};
  }
  // These are deterministic simulated hints, not a live audience or an actual call.
  const favorite = rng() < 0.78 ? q.answer : wrong[Math.floor(rng() * wrong.length)];
  if (action.name === 'phone') return {...g, lifelines: {...g.lifelines,
    phone: {at: g.index, choice: favorite, confidence: rng() > 0.4 ? 'fairly sure' : 'not certain'}}};
  const weights = [0, 1, 2, 3].map((c) => !available.includes(c as Choice) ? 0 : c === favorite ? 45 + Math.floor(rng() * 35) : 5 + Math.floor(rng() * 20));
  const sum = weights.reduce((a, b) => a + b, 0);
  const votes = weights.map((w) => Math.floor(100 * w / sum));
  votes[favorite] += 100 - votes.reduce((a, b) => a + b, 0);
  return {...g, lifelines: {...g.lifelines, audience: {at: g.index, votes}}};
}

/** Validate the entire saved snapshot so a pack update cannot break an in-progress game. */
export function restoreGame(raw: string | null, day: string): Game | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || v.version !== 1 || v.day !== day || !isText(v.revision)
      || !Array.isArray(v.deck) || v.deck.length !== 15 || !v.deck.every(validQuestion)
      || new Set(v.deck.map((q) => q.id)).size !== 15
      || !Number.isInteger(v.index) || Number(v.index) < 0 || Number(v.index) > 14
      || !Array.isArray(v.answers) || !v.answers.every(isChoice)
      || !(v.selected === null || isChoice(v.selected))
      || !['question', 'reveal', 'result'].includes(String(v.phase))
      || !['playing', 'won', 'lost', 'walked'].includes(String(v.status)) || !isRecord(v.lifelines)) return null;
    const g = v as unknown as Game;
    const count = g.answers.length;
    const right = correctCount(g);
    if (g.phase === 'question' && (g.status !== 'playing' || count !== g.index)) return null;
    if (g.phase === 'result' && g.status === 'playing') return null;
    if (g.phase === 'reveal' && (count !== g.index + 1 || g.selected !== g.answers[count - 1])) return null;
    if (g.status === 'playing' && (right !== count || count >= 15)) return null;
    if (g.status === 'won' && (count !== 15 || right !== 15 || g.index !== 14)) return null;
    if (g.status === 'lost' && (count !== g.index + 1 || right !== count - 1 || g.answers[count - 1] === g.deck[g.index].answer)) return null;
    if (g.status === 'walked' && (g.phase !== 'result' || count !== g.index || right !== count)) return null;
    if (g.answers.slice(0, -1).some((a, i) => a !== g.deck[i].answer)) return null;
    for (const name of ['fifty', 'audience', 'phone'] as const) {
      const hint = g.lifelines[name];
      if (hint === null) continue;
      if (!isRecord(hint) || !Number.isInteger(hint.at) || Number(hint.at) < 0 || Number(hint.at) > g.index) return null;
      if (name === 'fifty') {
        const h = g.lifelines.fifty!;
        if (!Array.isArray(h.removed) || h.removed.length !== 2 || !h.removed.every(isChoice)
          || new Set(h.removed).size !== 2 || h.removed.includes(g.deck[h.at].answer)) return null;
      } else if (name === 'audience') {
        const h = g.lifelines.audience!;
        if (!Array.isArray(h.votes) || h.votes.length !== 4 || !h.votes.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)
          || h.votes.reduce((a, b) => a + b, 0) !== 100) return null;
      } else if (!isChoice(g.lifelines.phone!.choice) || !['fairly sure', 'not certain'].includes(g.lifelines.phone!.confidence)) return null;
    }
    if (g.phase === 'question' && g.selected !== null && removedChoices(g).includes(g.selected)) return null;
    return g;
  } catch { return null; }
}
export function shareText(g: Game): string {
  const cells = g.deck.map((q, i) => i >= g.answers.length ? '⬜' : g.answers[i] === q.answer ? '🟩' : '🟥');
  return [`Who Wants to Be a Triviaire #${challengeNumber(g.day)}`, `${g.day} · ${money(winnings(g))} · ${correctCount(g)}/15`,
    '', cells.slice(0, 5).join(''), cells.slice(5, 10).join(''), cells.slice(10).join(''), '',
    `${Object.values(g.lifelines).filter(Boolean).length}/3 lifelines used · ${g.status === 'walked' ? 'Walked away' : g.status === 'won' ? 'Million won!' : 'Challenge complete'}`].join('\n');
}
