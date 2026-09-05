import type {
  Answer,
  Question,
  QuestionsFile,
  RoundResult,
  SavedGame,
} from './types';

export const QUESTIONS_PER_DAY = 4;
export const MAX_STRIKES = 3;

const CHALLENGE_EPOCH_UTC = Date.UTC(2026, 7, 14);
const DAY_MS = 86_400_000;
const QUESTION_ORDER_SEED = 'feudle:question-order:v1';

export const normalizeGuess = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const patternToRegex = (pattern: string) => {
  const characters = Array.from(pattern);
  let source = '^';

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];

    if (/\s/.test(character)) {
      const adjacentOptionalLetter =
        (index > 0 && /[a-z]/.test(characters[index - 1])) ||
        (index < characters.length - 1 &&
          /[a-z]/.test(characters[index + 1]));
      source += adjacentOptionalLetter ? '\\s?' : '\\s';
    } else if (/[a-z]/.test(character)) {
      source += `${escapeRegex(character)}?`;
    } else {
      source += escapeRegex(character.toLocaleLowerCase());
    }
  }

  source += '$';
  return new RegExp(source, 'iu');
};

export const matchesAnswer = (guess: string, answer: Answer) => {
  const normalized = normalizeGuess(guess);
  return (
    normalized.length > 0 &&
    answer.patterns.some((pattern) => patternToRegex(pattern).test(normalized))
  );
};

export const findAnswerIndex = (
  guess: string,
  question: Question,
): number =>
  question.answers.findIndex((answer) => matchesAnswer(guess, answer));

export const validateQuestionsFile = (
  candidate: unknown,
): QuestionsFile => {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Question data is not an object.');
  }

  const data = candidate as Partial<QuestionsFile>;

  if (data.formatVersion !== 1) {
    throw new Error(
      `Unsupported question format: ${String(data.formatVersion)}.`,
    );
  }

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('Question data does not include any questions.');
  }

  for (const question of data.questions) {
    if (
      typeof question.id !== 'string' ||
      typeof question.question !== 'string' ||
      question.question.trim().length === 0 ||
      !Array.isArray(question.answers) ||
      question.answers.length === 0
    ) {
      throw new Error(`Invalid question entry: ${String(question.id)}.`);
    }

    for (const answer of question.answers) {
      if (
        !Number.isInteger(answer.points) ||
        typeof answer.display !== 'string' ||
        answer.display.trim().length === 0 ||
        !Array.isArray(answer.patterns) ||
        answer.patterns.length === 0 ||
        answer.patterns.some(
          (pattern) =>
            typeof pattern !== 'string' || pattern.trim().length === 0,
        )
      ) {
        throw new Error(`Invalid answer entry in ${question.id}.`);
      }
    }
  }

  return data as QuestionsFile;
};

export const getUtcDayKey = (date = new Date()) =>
  [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');

export const getChallengeNumber = (date = new Date()) =>
  Math.max(
    1,
    Math.floor(
      (Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      ) -
        CHALLENGE_EPOCH_UTC) /
        DAY_MS,
    ) + 1,
  );

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getDailyQuestions = (
  questions: Question[],
  challengeNumber: number,
  count = QUESTIONS_PER_DAY,
) => {
  if (questions.length < count) {
    throw new Error(`At least ${count} questions are required.`);
  }

  if (!Number.isSafeInteger(challengeNumber) || challengeNumber < 1) {
    throw new Error('Challenge number must be a positive integer.');
  }

  const ordered = [...questions].sort((first, second) => {
    const firstHash = hashString(`${QUESTION_ORDER_SEED}:${first.id}`);
    const secondHash = hashString(`${QUESTION_ORDER_SEED}:${second.id}`);
    return firstHash - secondHash || first.id.localeCompare(second.id);
  });
  const start = (challengeNumber - 1) * count;

  return Array.from(
    {length: count},
    (_, index) => ordered[(start + index) % ordered.length],
  );
};

export const emptySavedGame = (
  dayKey: string,
  challengeNumber: number,
): SavedGame => ({
  version: 2,
  dayKey,
  challengeNumber,
  questionsPerDay: QUESTIONS_PER_DAY,
  questionIndex: 0,
  totalScore: 0,
  foundByQuestion: {},
  strikesByQuestion: {},
  rounds: [],
  status: 'playing',
});

export const scoreEmoji = (round: RoundResult) => {
  const ratio = round.possible > 0 ? round.points / round.possible : 0;
  if (ratio >= 0.7) return '🟩';
  if (ratio >= 0.35) return '🟨';
  return '⬛';
};

export const getShareText = (
  challengeNumber: number,
  rounds: RoundResult[],
  totalScore: number,
) => {
  const possible = rounds.reduce((sum, round) => sum + round.possible, 0);
  const tiles = rounds.map(scoreEmoji).join('');
  return [
    `Feudle #${challengeNumber}  ${totalScore}/${possible}`,
    '',
    tiles,
    '',
    '4 questions. One daily challenge.',
  ].join('\n');
};

export const millisecondsUntilNextUtcDay = (date = new Date()) => {
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
  return Math.max(0, next - date.getTime());
};
