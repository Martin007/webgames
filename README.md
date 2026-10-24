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

`predev`, `pretest`, and `prebuild` prepare
`public/games/triviaire/questions.json` from Q1–Q15 CSV snapshots when available,
or fetch those tabs from Google Sheets. Until all fifteen snapshots are committed,
CI builds require sheet access. Local development can fall back to an existing
generated pack when offline. Both editorial catalogs are reapplied in every case.
Vite copies both games’ JSON files to `dist/games/…`; question banks are fetched
as static assets, not bundled into the main application JavaScript. Generated JSON
is ignored by Git; snapshots, editorial catalogs and the importer are versioned.

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
A completed question shows an **Explanation** button beside **Next question** or
**See my result** when that question has editorial explanation data. It explains
the correct answer and each alternative, with source links when available. The
button stays hidden before the answer is locked and for questions without data.
A wrong answer ends the daily run. Correct answers at questions 5 and 10 secure
$1,000 and $32,000 respectively. **Walk away** confirms the choice and keeps the
current winnings. There is no countdown timer on individual questions.

Each lifeline may be used once per daily run:

- **50:50** removes two wrong answers.
- **Ask the audience** produces a seeded, simulated poll.
- **Phone a friend** produces a seeded, simulated suggestion.

The latter two can be wrong and are explicitly labeled simulated. They do not
contact real people. Questions can have custom friend replies: the answer text
is used for a correct simulated guess, and the hint text for a wrong guess or an
unknown answer. Missed calls and missing variants retain the standard messages.
Optional original synthesized sound effects are off by
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

The current importer reads difficulty tabs **Q1–Q15** from the
[supplied Google Sheet](https://docs.google.com/spreadsheets/d/1-SYaM0xz_f7YLtMnIk6WkyDa78JOsk-mJD37diF-Vuc/edit).
Each tab contributes its own difficulty pool, with stable IDs derived from its
level and normalized prompt. It accepts both the workbook's transposed question
columns and conventional row-oriented exports.

The legacy single-tab snapshot in `data/triviaire/source.csv` was retrieved on
2026-09-05 from tab `599441168`.
It contains **1,044 data rows**. The importer removes **60 duplicate prompts**
with matching correct answers. One truncated prompt (`J`, source row 177) is
quarantined rather than shown to players, leaving **983 playable questions**.
Initial runtime revision: `c6954bcb18d809a8`.

Current tab snapshots use `data/triviaire/Q1.csv` through `Q15.csv`; generated
runtime data is in `public/games/triviaire/questions.json`. Original source row numbers and the
sheet’s optional source/contributor columns are retained in the JSON. Correct
answer letters are converted to zero-based indices. Text is normalized without
rewriting the supplied questions or changing their keyed correct answers.
Incomplete prompts shorter than eight characters are excluded and recorded in
`source.excludedRows`; the original CSV remains unchanged.

The legacy snapshot has no difficulty ratings; current Q1–Q15 pools retain the
workbook's intended levels. Import validation checks structure and consistency,
not factual accuracy: the entire community question bank has not been
independently fact-checked. Editorial explanations include sources and notes on
ambiguous wording for the questions they cover.

To intentionally refresh the versioned snapshot from the source sheet:

```sh
npm run import:triviaire
npm test
npm run build
# Review and commit data/triviaire/Q1.csv through Q15.csv and accompanying changes.
```

Or convert a directory containing exported `Q1.csv` through `Q15.csv` without
network access:

```sh
npm run import:triviaire -- --input-dir /path/to/tab-csvs
```

Both commands validate all fifteen tabs and merge the editorial catalogs before
writing generated JSON. The default online import also saves the downloaded tab
snapshots; `--input-dir` reads the supplied files without copying them into the
repository. Use `--output /path/to/pack.json` to convert a separate pack without
changing the committed snapshots. The parser supports BOMs, quoted commas,
newlines, escaped quotes and CRLF. It rejects malformed CSV, HTML/login responses,
conflicting duplicate answers and missing or empty difficulty pools. Incomplete
or invalid questions within a difficulty tab are excluded and reported.

A deployment with a changed pack can change the deck for players who have not
started that day; already-started runs retain their snapshot. Review data changes
and coordinate pack updates at a UTC day boundary when consistency matters.

Runtime JSON contract:

```ts
interface TriviaireQuestion {
  id: string;                        // Stable hash of the normalized prompt
  level?: number;                    // Q1–Q15 pool; absent in the legacy flat pack
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  sourceRows?: number[];
  source?: string;
  contributor?: string;
  explanation?: {
    summary: string;
    choices: [string, string, string, string]; // Same order as question.choices
    sources?: {title: string; url: string}[];  // HTTPS links
  };
  friendReply?: {
    answer?: string;                 // Correct simulated guess, including uncertain ones
    hint?: string;                   // Wrong guess or unknown answer
  };                                // At least one nonempty variant when present
}
interface TriviaireBank {
  version: 1;
  revision: string;
  source: {
    url: string;
    rows: number;
    duplicatesRemoved: number;
    duplicateRows?: number[];         // Legacy single-tab metadata
    excludedRows: {level?: number; row: number; reason: string}[];
    difficulty: 'unrated' | 'Q1-Q15';
    sheets?: {level: number; name: string; rows: number; duplicatesRemoved: number;
      excludedRows: number; questions: number}[];
  };
  questions: TriviaireQuestion[];
}
```

### Adding answer explanations

Explanations are maintained separately from the source workbook in
`data/triviaire/explanations.json`. Both the explicit importer and the build-time
preparation step merge this catalog into the generated question pack. The
preparation step also reapplies the catalog when using an existing offline pack,
so removing an explanation removes it from the next generated pack.

The catalog covers all 120 questions in challenges #47–49 and #52–56
(21–23 and 26–30 October 2026).
Each entry explains the correct answer and all three alternatives, with sources
and clarifying notes where a source prompt is imprecise. Explanations stay attached
to those questions on future days; other questions show no button until their
entries are added.

Use the question's stable ID and copy its **original, unshuffled** `prompt`,
`choices` and zero-based `answer` from `public/games/triviaire/questions.json`:

```json
{
  "version": 1,
  "questions": {
    "t-q1-<prompt-hash>": {
      "prompt": "The exact question prompt",
      "choices": ["First choice", "Second choice", "Third choice", "Fourth choice"],
      "answer": 0,
      "explanation": {
        "summary": "Explain the fact or reasoning that makes the answer correct.",
        "choices": [
          "Why the first choice is correct.",
          "Why the second choice does not answer this question.",
          "Why the third choice does not answer this question.",
          "Why the fourth choice does not answer this question."
        ],
        "sources": [{"title": "Reference title", "url": "https://example.com/reference"}]
      }
    }
  }
}
```

The four explanations follow the source choice order, and the game keeps them
aligned when shuffling answers. The summary and all four choice explanations
must be nonempty. Sources are optional and must use valid HTTPS URLs. Missing,
null or blank explanation values are omitted. A missing catalog is equivalent
to an empty one, and entries for questions absent from a pack are ignored.

The copied question fields are identity guards: if a later sheet edit changes
the prompt, choice order or keyed correct answer, the importer warns and skips
that explanation until its entry is reviewed. This prevents an old explanation
from being attached to a changed question. Adding explanations updates the pack
revision without changing its question IDs, daily selection, answers or order.
Run `npm test` and `npm run build` after editing the catalog, and commit the
catalog rather than the generated JSON.

### Adding Phone a friend replies

Optional custom replies live in `data/triviaire/friend-replies.json`. The catalog
covers questions 1–10 of challenge #49 (23 October 2026) and questions 1–11 of
challenges #52–#56 (26–30 October 2026), with both variants for each question.
Replies remain available whenever those questions appear again.

Copy the stable question ID and its exact **original, unshuffled** `prompt`,
`choices` and zero-based numeric `answer` from the generated question pack:

```json
{
  "version": 1,
  "questions": {
    "t-q1-<prompt-hash>": {
      "prompt": "The exact question prompt",
      "choices": ["First choice", "Second choice", "Third choice", "Fourth choice"],
      "answer": 0,
      "friendReply": {
        "answer": "Here is the connection I remember that makes this answer fit.",
        "hint": "I don't know but I remember a related detail that might help."
      }
    }
  }
}
```

Use answer **names or text**, never hard-coded A–D letters: the game shuffles
choices for each challenge. Each reply can have an `answer`, a `hint`, or both.
The simulated call result determines which variant is used:

| Simulated result | Custom variant |
| --- | --- |
| Correct guess, whether fairly sure or uncertain | `answer` |
| Wrong guess or does not know | `hint` |
| No answer / missed call | Standard missed-call message |

If the matching variant is absent, the standard simulated message is used. A
custom hint replaces a wrong guess with an unsure reply that recommends no
option. The random draws and one-use lifeline rule stay the same. Write replies
in a conversational voice, and keep them concise enough for the inline hint
card. New hints should begin with `I don't know but` and offer useful partial
knowledge: a related fact, a remembered detail, or a reason to rule out an option.
They should not simply repeat the question or announce the correct answer.

New call messages are saved with their result. A previously started game can use
the current catalog when calling. For an older call that has already been used,
the display may add answer text to a correct recommendation or a hint to an
unknown result; its saved choice, confidence and progress stay unchanged. Older
wrong recommendations and missed calls keep their standard message, and a saved
custom message always takes precedence over newer catalog text.

The importer normalizes Unicode and whitespace. Missing, null and blank variants
are omitted; if neither variant has text, no `friendReply` is emitted. Other
payload or variant types are rejected. As with explanations, the copied question
fields are guards: changed prompts, choice order or answers produce a warning
and skip the reply until reviewed. Entries for absent question IDs are harmless,
and a missing catalog is equivalent to an empty one.

Both the explicit importer and build preparation merge this catalog after the
explanation catalog. They also reapply both catalogs to existing offline packs,
so removing or blanking a reply removes earlier metadata. Reply changes update
the pack revision while preserving explanations, question IDs, daily selection,
choices, answers and source fields. Run `npm test` and `npm run build`, then
commit the catalog and code changes rather than generated JSON.

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
data/triviaire/explanations.json  Optional, source-checked answer explanations
data/triviaire/friend-replies.json  Optional custom Phone a friend answer/hint text
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

`npm test` runs the Feudle/animation tests, Triviaire engine and editorial-metadata tests,
and importer tests. Coverage includes deterministic decks and answer mapping,
UTC boundaries, all prize checkpoints and wrong-answer payouts, walk-away,
all three lifelines, invalid saves, result sharing, data validation and CSV edge
cases, explanation-to-choice alignment, existing-save enrichment, stale metadata
guards, friend-reply variants, catalog removal and offline reapplication.
`npm run build` performs the TypeScript check and production build.

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
