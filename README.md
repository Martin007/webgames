# webgames
Collection of word web games.

## Quizle

Quizle is a static, six-question daily challenge built with React, Vite, and
Remotion. Players type survey-board answers, collect each answer's point value,
and get three misses per round. A deterministic UTC-day seed gives everyone the
same questions, progress is saved in the browser, and the final spoiler-free
score grid can be copied and shared.

Run it locally with:

```sh
npm install
npm run dev
```

Create the static production build with:

```sh
npm run build
```

The build includes the root `questions.json` as a runtime asset rather than
bundling its contents into the application JavaScript.

## Family Feud questions

`questions.json` is the runtime data interface for the game. The game should read
this file directly.

The top-level structure is:

```ts
interface QuestionsFile {
  formatVersion: 1;
  matchingRules: {
    caseSensitive: false;
    lowercaseLetters: "optional";
    alternativeSeparator: "~";
    displayAnswer: "uppercase first pattern";
  };
  questions: Question[];
}

interface Question {
  id: string;
  question: string;
  answers: Answer[];
}

interface Answer {
  points: number;
  display: string;
  patterns: string[];
}
```

The metadata fields have these meanings:

- `formatVersion` identifies this JSON contract. A game should reject an
  unsupported version.
- `matchingRules` records the answer-matching behavior.
- `questions` is the ordered collection of game questions.

Each question has an order-derived ID such as `q0001`, its prompt, and its answer
board. Preserve the order of both `questions` and `answers`; answer order is the
original board order, including the order of equal-point answers. If UI state
needs an answer ID, use the question ID plus the answer array index.

An answer entry represents one board slot:

```json
{
  "points": 9,
  "display": "FRENCH FRIES",
  "patterns": ["FRENCH FRies", "POTATO"]
}
```

- `points` is the score awarded when the slot is revealed. It is an integer and
  may be zero. Scores for a question are not guaranteed to total exactly 100.
- `display` is the text shown on the board. Do not use it as the sole matching
  value.
- `patterns` contains every accepted synonym for that board slot. A guess
  matching any pattern reveals the same slot and awards its points once.

Answer matching is case-insensitive. Uppercase letters in a pattern are required;
each lowercase letter is an individually optional occurrence of that same letter.
For example:

- `NUTs` accepts `NUT` and `NUTS`.
- `COOKies` accepts `COOK` and `COOKIES`, plus intermediate combinations allowed
  by the individually optional `i`, `e`, and `s`.
- `family TIES` accepts `TIES` and `FAMILY TIES`, including the legacy partial
  optional-letter combinations.
- `["STOVE", "OVEN", "RANGE"]` accepts any of those three complete patterns for
  one answer slot.

For player input, trim leading/trailing whitespace, compare letters without case,
and collapse repeated internal spaces. When omission of lowercase text leaves an
adjacent separator space, omit that space too. Escape punctuation as literal text
when compiling patterns into regular expressions.

At load time, the game should verify:

1. `formatVersion === 1`.
2. Every question has a non-empty prompt and at least one answer.
3. Every answer has an integer `points`, a non-empty `display`, and at least one
   non-empty pattern.
