export interface Answer {
  points: number;
  display: string;
  patterns: string[];
}

export interface Question {
  id: string;
  question: string;
  answers: Answer[];
}

export interface QuestionsFile {
  formatVersion: number;
  matchingRules: {
    caseSensitive: false;
    lowercaseLetters: 'optional';
    alternativeSeparator: string;
    displayAnswer: string;
  };
  questions: Question[];
}

export interface RoundResult {
  questionId: string;
  points: number;
  possible: number;
  foundCount: number;
  answerCount: number;
}

export interface SavedGame {
  version: 2;
  dayKey: string;
  challengeNumber: number;
  questionsPerDay: number;
  questionIndex: number;
  totalScore: number;
  foundByQuestion: Record<string, number[]>;
  strikesByQuestion: Record<string, number>;
  rounds: RoundResult[];
  status: 'playing' | 'complete';
}
