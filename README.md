# Webgames

A collection of free, daily browser games. Built with React, TypeScript and Vite,
with independent game modules and static question assets. No account, server,
external fonts, or third-party media is required to play.

## Games

**Feudle** — four daily survey boards. Guess the crowd’s answers, earn their point
values, and avoid three strikes per board. Its original question order, matching
rules, UTC challenge numbering (epoch: 2026-08-14), animations and
`feudle:game:` browser saves are preserved.

**Who Wants to Be a Triviaire** — fifteen multiple-choice questions, three
lifelines, and a virtual $1,000,000 prize. An original blue-and-gold presentation
inspired by classic television quiz shows, with no show logos, recordings or
other borrowed media. This is an independent, unofficial game; prizes are not
real money.

The homepage shows each game’s daily progress and lets players resume a run or
revisit its result. Each game is lazy-loaded, and Feudle’s legacy global styles
are mounted only while Feudle is open.

## Development

Use Node.js 24 (the CI version) and the existing lockfile:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`predev`, `pretest`, and `prebuild` validate the committed Triviaire CSV snapshot
and generate `public/games/triviaire/questions.json`. After dependencies are
installed, builds do **not** need Google Sheets access. Vite copies both games’
JSON files to `dist/games/…`; question banks are fetched as static assets, not
bundled into the main application JavaScript. Generated JSON is ignored by Git;
the source snapshot and importer are versioned together.

### Routes and deployment

The hash routes work on GitHub Pages without server-side rewrites:

| Route | Screen |
| --- | --- |
| `/webgames/#/` | Game collection / landing page |
| `/webgames/#/feudle` | Feudle |
| `/webgames/#/triviaire` | Who Wants to Be a Triviaire |

The root `/webgames/` now opens the collection instead of Feudle. Existing saved
Feudle progress remains available when choosing Feudle. Old shared scores still
lead to the site, where Feudle is one click away.

The Vite base is `/webgames/`. Pushes to `master` run
`.github/workflows/deploy-pages.yml`: tests, build, then GitHub Pages deployment.
In **Settings → Pages**, select **GitHub Actions** as the source. The configured
site is `https://martin007.github.io/webgames/`.

Pull requests run `.github/workflows/check.yml`, including tests and a production
build, and upload the resulting static site as the `webgames-preview` artifact.
Merging a pull request, not merely opening it, triggers the production deployment.

## Triviaire rules and daily behavior

Each correct answer advances the prize ladder from $100 to $1,000,000. Select
A–D, then explicitly press **Final answer**. Answer selection alone never submits.
The answer reveal is saved immediately; refreshing cannot undo a locked answer.
A wrong answer ends the daily run. Correct answers at questions 5 and 10 secure
$1,000 and $32,000 respectively. **Walk away** confirms the choice and keeps the
current winnings. There is no countdown timer on individual questions.

Each lifeline may be used once per daily run:

- **50:50** removes two wrong answers.
- **Ask the audience** produces a seeded, simulated poll.
- **Phone a friend** produces a seeded, simulated suggestion.

The latter two can be wrong and are explicitly labeled simulated. They do not
contact real people. Optional original synthesized sound effects are off by
default. Keyboard A–D selection, native focus-trapped dialogs, visible focus,
status announcements, reduced motion, and mobile layouts are supported.

A day is defined by **00:00 UTC** (Triviaire #1: 2026-09-05). A stable ID-based
question order selects fifteen unique questions per day and exhausts the bank
before repeating. Answer order and hints are deterministic per date/question.
Everyone using the same versioned pack gets the same challenge. An open tab
notices UTC midnight and switches to the new challenge.

Saves are namespaced `triviaire:daily:YYYY-MM-DD`. Each save contains the chosen
question snapshot, selected/locked answers, phase and spent lifelines, so a pack
update cannot invalidate an unfinished run. Bad saves are rejected with a
recovery message. Storage failures show a warning but do not prevent play. A
completed run cannot be restarted through the UI on the same day. Results include
a spoiler-free share grid, copy fallback and reset countdown.

This is a client-only casual game: progress does not sync across devices, and
clearing or modifying browser storage can bypass the daily-attempt rule. Question
answers are public static data, not protected by a server. No competitive
anti-cheat or globally verified leaderboard is implied.

## Triviaire question source and conversion

The initial snapshot comes from the [supplied Google Sheet](https://docs.google.com/spreadsheets/d/1-SYaM0xz_f7YLtMnIk6WkyDa78JOsk-mJD37diF-Vuc/edit?gid=599441168), tab `599441168`, retrieved on 2026-09-05.
It contains **1,044 data rows**. The importer removes **60 duplicate prompts**
with matching correct answers. One truncated prompt (`J`, source row 177) is
quarantined rather than shown to players, leaving **983 playable questions**.
Initial runtime revision: `c6954bcb18d809a8`.

The original export is in `data/triviaire/source.csv`; generated runtime data is
in `public/games/triviaire/questions.json`. Original source row numbers and the
sheet’s optional source/contributor columns are retained in the JSON. Correct
answer letters are converted to zero-based indices. Text is normalized without
rewriting the supplied questions or changing their keyed correct answers.
Incomplete prompts shorter than eight characters are excluded and recorded in
`source.excludedRows`; the original CSV remains unchanged.

The sheet has **no difficulty ratings**. Stakes increase, but question difficulty
is mixed; the game does not pretend the later questions are independently rated
harder. Import validation checks structure and consistency, not factual accuracy:
the community questions have not been independently fact-checked.

To intentionally refresh the versioned snapshot from the source sheet:

```sh
npm run import:triviaire
npm test
npm run build
# Review and commit data/triviaire/source.csv and any accompanying code changes.
```

Or import an exported CSV without network access:

```sh
npm run import:triviaire -- --input /path/to/questions.csv
```

Both commands update the source snapshot and generated JSON only after validating
the input. Use `--output /path/to/pack.json` to convert a separate pack without
changing the committed snapshot. The parser supports BOMs, quoted commas,
newlines, escaped quotes and CRLF. It rejects malformed rows, non-unique choices,
invalid correct-answer letters, HTML/login responses, conflicting duplicate
answers and banks containing fewer than fifteen unique questions.

A deployment with a changed pack can change the deck for players who have not
started that day; already-started runs retain their snapshot. Review data changes
and coordinate pack updates at a UTC day boundary when consistency matters.

Runtime JSON contract:

```ts
interface TriviaireQuestion {
  id: string;                        // Stable hash of the normalized prompt
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  sourceRows?: number[];
  source?: string;
  contributor?: string;
}
interface TriviaireBank {
  version: 1;
  revision: string;
  source: {
    url: string;
    gid: string;
    rows: number;
    duplicatesRemoved: number;
    duplicateRows: number[];
    excludedRows: {row: number; reason: string}[];
    difficulty: 'unrated';
  };
  questions: TriviaireQuestion[];
}
```

## Project layout

```text
src/
  App.tsx                    Hash router and lazy game boundaries
  Home.tsx, hub.css           Collection homepage
  shared/                    Small shared UI and UTC date helpers
  games/
    feudle/                  Original game, tests, styles and animation
    triviaire/               New game, pure engine, tests and styles
data/triviaire/source.csv     Versioned question-sheet export
public/
  favicon.svg
  games/feudle/questions.json Original Feudle bank (unchanged)
  games/triviaire/questions.json  Generated, gitignored runtime pack
scripts/
  import-triviaire.mjs        Explicit refresh / CSV-to-JSON importer
  ensure-triviaire.mjs        Offline build-time conversion
  import-triviaire.check.mjs  CSV importer regression tests
```

## Verification

`npm test` runs the existing 13 Feudle/animation tests, 46 Triviaire engine tests,
and 8 importer tests. Coverage includes deterministic decks and answer mapping,
UTC boundaries, all prize checkpoints and wrong-answer payouts, walk-away,
all three lifelines, invalid saves, result sharing, data validation and CSV edge
cases. `npm run build` performs the TypeScript check and production build.

The implementation was also exercised in Chromium using the compiled app with
in-memory copies of the real static assets: all three lifelines, a full win,
checkpoint loss, walk-away confirmation, saved-run recovery, completed-run
protection, Feudle resume, network-error retry, live midnight rollover, and layout
checks from 320 to 1440px. This was an in-memory browser check, not a claim of
post-deployment testing on GitHub Pages.

## Family Feud questions

`public/games/feudle/questions.json` is the runtime data interface for the game. The game should read
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
