import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Player} from '@remotion/player';
import {AMBIENT_DURATION_IN_FRAMES, AmbientScene} from './AmbientScene';
import {
  MAX_STRIKES,
  QUESTIONS_PER_DAY,
  emptySavedGame,
  findAnswerIndex,
  getChallengeNumber,
  getDailyQuestions,
  getShareText,
  getUtcDayKey,
  millisecondsUntilNextUtcDay,
  scoreEmoji,
  validateQuestionsFile,
} from './game';
import {
  ArrowIcon,
  BarChartIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  HelpIcon,
  SparkIcon,
  TrophyIcon,
} from './icons';
import type {
  Question,
  QuestionsFile,
  RoundResult,
  SavedGame,
} from './types';

type Phase = 'loading' | 'intro' | 'playing' | 'result' | 'error';
type FeedbackTone = 'right' | 'wrong' | 'neutral';

interface Feedback {
  message: string;
  tone: FeedbackTone;
}

interface LifetimeStats {
  played: number;
  average: number;
  best: number;
}

const STORAGE_PREFIX = 'feudle:game:';

const loadSavedGame = (dayKey: string): SavedGame | null => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${dayKey}`);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    if (
      saved.version !== 1 ||
      saved.dayKey !== dayKey ||
      saved.questionsPerDay !== QUESTIONS_PER_DAY ||
      !Array.isArray(saved.rounds)
    ) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
};

const saveGame = (game: SavedGame) => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${game.dayKey}`, JSON.stringify(game));
  } catch {
    // The game remains fully playable when private browsing blocks storage.
  }
};

const getLifetimeStats = (): LifetimeStats => {
  const completed: SavedGame[] = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const item = localStorage.getItem(key);
      if (!item) continue;
      const parsed = JSON.parse(item) as SavedGame;
      if (parsed.version === 1 && parsed.status === 'complete') {
        completed.push(parsed);
      }
    }
  } catch {
    return {played: 0, average: 0, best: 0};
  }

  const percentages = completed.map((game) => {
    const possible = game.rounds.reduce(
      (sum, round) => sum + round.possible,
      0,
    );
    return possible > 0 ? Math.round((game.totalScore / possible) * 100) : 0;
  });

  return {
    played: completed.length,
    average:
      percentages.length > 0
        ? Math.round(
            percentages.reduce((sum, percentage) => sum + percentage, 0) /
              percentages.length,
          )
        : 0,
    best: percentages.length > 0 ? Math.max(...percentages) : 0,
  };
};

const formatDate = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const formatCountdown = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

const Logo = () => (
  <div className="logo" aria-label="Feudle">
    <span className="logo__tile">F</span>
    <span className="logo__word">eudle</span>
  </div>
);

const Header = ({
  onHelp,
  onStats,
}: {
  onHelp: () => void;
  onStats: () => void;
}) => (
  <header className="site-header">
    <div className="site-header__inner">
      <Logo />
      <p className="site-header__tagline">The daily question game</p>
      <nav className="site-header__actions" aria-label="Game information">
        <button
          className="icon-button"
          type="button"
          onClick={onStats}
          aria-label="View statistics"
        >
          <BarChartIcon />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onHelp}
          aria-label="How to play"
        >
          <HelpIcon />
        </button>
      </nav>
    </div>
  </header>
);

const Modal = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal__panel">
        <div className="modal__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
};

const HowToPlay = ({onClose}: {onClose: () => void}) => (
  <Modal title="How to play" onClose={onClose}>
    <p className="modal__lead">
      Think like the crowd. Find the most popular answers on each survey board.
    </p>
    <ol className="how-to-list">
      <li>
        <span>1</span>
        <div>
          <strong>Read the prompt</strong>
          <p>Each question has a board of hidden popular answers.</p>
        </div>
      </li>
      <li>
        <span>2</span>
        <div>
          <strong>Type your guesses</strong>
          <p>Correct answers reveal their points. Close synonyms count too.</p>
        </div>
      </li>
      <li>
        <span>3</span>
        <div>
          <strong>Mind your strikes</strong>
          <p>Three misses end a round. There are six rounds each day.</p>
        </div>
      </li>
    </ol>
    <div className="share-key">
      <span>🟩 70%+</span>
      <span>🟨 35%+</span>
      <span>⬛ under 35%</span>
    </div>
    <button className="button button--primary button--full" onClick={onClose}>
      Got it
    </button>
  </Modal>
);

const StatsModal = ({onClose}: {onClose: () => void}) => {
  const stats = getLifetimeStats();
  return (
    <Modal title="Your stats" onClose={onClose}>
      <div className="stats-grid">
        <div>
          <strong>{stats.played}</strong>
          <span>Played</span>
        </div>
        <div>
          <strong>{stats.average}%</strong>
          <span>Average</span>
        </div>
        <div>
          <strong>{stats.best}%</strong>
          <span>Best</span>
        </div>
      </div>
      <p className="modal__note">
        Your scores are stored only in this browser.
      </p>
      <button className="button button--primary button--full" onClick={onClose}>
        Back to Feudle
      </button>
    </Modal>
  );
};

const IntroScreen = ({
  dayKey,
  challengeNumber,
  onStart,
}: {
  dayKey: string;
  challengeNumber: number;
  onStart: () => void;
}) => (
  <main className="screen screen--intro">
    <section className="intro-card">
      <div className="eyebrow">
        <SparkIcon />
        Daily challenge
      </div>
      <h1>
        Six questions.
        <br />
        <em>How well do you know people?</em>
      </h1>
      <p className="intro-card__copy">
        Guess the answers people gave, collect the points, and see how your
        instincts stack up.
      </p>
      <div className="intro-meta">
        <div>
          <span>Today</span>
          <strong>{formatDate(dayKey)}</strong>
        </div>
        <div>
          <span>Challenge</span>
          <strong>#{challengeNumber}</strong>
        </div>
        <div>
          <span>Questions</span>
          <strong>{QUESTIONS_PER_DAY}</strong>
        </div>
      </div>
      <button
        type="button"
        className="button button--primary button--start"
        onClick={onStart}
      >
        Play today’s Feudle
        <ArrowIcon />
      </button>
      <p className="intro-card__hint">
        <ClockIcon />
        A fresh challenge arrives every day
      </p>
    </section>
    <div className="sample-board" aria-hidden="true">
      <span className="sample-board__label">POPULAR ANSWERS</span>
      <div className="sample-answer sample-answer--one">
        <span>1</span>
        <i />
        <b>42</b>
      </div>
      <div className="sample-answer sample-answer--two">
        <span>2</span>
        <i />
        <b>27</b>
      </div>
      <div className="sample-answer sample-answer--three">
        <span>3</span>
        <i />
        <b>18</b>
      </div>
    </div>
  </main>
);

const Progress = ({
  current,
  rounds,
}: {
  current: number;
  rounds: RoundResult[];
}) => (
  <div
    className="progress"
    aria-label={`Question ${Math.min(current + 1, QUESTIONS_PER_DAY)} of ${QUESTIONS_PER_DAY}`}
  >
    {Array.from({length: QUESTIONS_PER_DAY}, (_, index) => {
      const result = rounds[index];
      const state = result ? 'done' : index === current ? 'current' : 'future';
      return (
        <span
          key={index}
          className={`progress__step progress__step--${state}`}
          aria-hidden="true"
        >
          {result ? <CheckIcon /> : index + 1}
        </span>
      );
    })}
  </div>
);

const AnswerBoard = ({
  question,
  found,
  revealAll,
}: {
  question: Question;
  found: number[];
  revealAll: boolean;
}) => (
  <ol className="answer-board" aria-label="Answer board">
    {question.answers.map((answer, index) => {
      const isFound = found.includes(index);
      const isMissed = revealAll && !isFound;
      return (
        <li
          key={`${question.id}-${index}`}
          className={[
            'answer-slot',
            isFound ? 'answer-slot--found' : '',
            isMissed ? 'answer-slot--missed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="answer-slot__number">
            {isFound ? <CheckIcon /> : index + 1}
          </span>
          <span className="answer-slot__answer">
            {isFound || isMissed ? answer.display : <i />}
          </span>
          <strong className="answer-slot__points">
            {isFound || isMissed ? answer.points : '—'}
          </strong>
        </li>
      );
    })}
  </ol>
);

const GameScreen = ({
  game,
  questions,
  feedback,
  onGuess,
  onEndRound,
  onNext,
}: {
  game: SavedGame;
  questions: Question[];
  feedback: Feedback | null;
  onGuess: (guess: string) => void;
  onEndRound: () => void;
  onNext: () => void;
}) => {
  const [guess, setGuess] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const question = questions[game.questionIndex];
  const found = game.foundByQuestion[question.id] ?? [];
  const strikes = game.strikesByQuestion[question.id] ?? 0;
  const roundOver =
    strikes >= MAX_STRIKES || found.length === question.answers.length;
  const roundScore = found.reduce(
    (sum, answerIndex) => sum + question.answers[answerIndex].points,
    0,
  );

  useEffect(() => {
    setGuess('');
    inputRef.current?.focus();
  }, [game.questionIndex]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (roundOver || guess.trim().length === 0) return;
    onGuess(guess);
    setGuess('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <main className="screen screen--game">
      <div className="game-topbar">
        <Progress current={game.questionIndex} rounds={game.rounds} />
        <div className="score-pill" aria-label={`Total score ${game.totalScore}`}>
          <span>Score</span>
          <strong>{game.totalScore}</strong>
        </div>
      </div>

      <section className="question-card">
        <div className="question-card__meta">
          <span>
            Question {game.questionIndex + 1} of {QUESTIONS_PER_DAY}
          </span>
          <span>{question.answers.length} answers on the board</span>
        </div>
        <h1>{question.question}</h1>
        <div className="round-score">
          <span>Round points</span>
          <strong>{roundScore}</strong>
        </div>
      </section>

      <AnswerBoard
        question={question}
        found={found}
        revealAll={roundOver}
      />

      <section className="guess-zone">
        {roundOver ? (
          <div className="round-complete">
            <div>
              <span className="round-complete__icon">
                {found.length === question.answers.length ? (
                  <SparkIcon />
                ) : (
                  <CheckIcon />
                )}
              </span>
              <div>
                <strong>
                  {found.length === question.answers.length
                    ? 'Clean sweep!'
                    : 'Round complete'}
                </strong>
                <p>
                  You found {found.length} of {question.answers.length} answers
                  for {roundScore} points.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button button--primary"
              onClick={onNext}
            >
              {game.questionIndex === QUESTIONS_PER_DAY - 1
                ? 'See my results'
                : 'Next question'}
              <ArrowIcon />
            </button>
          </div>
        ) : (
          <>
            <form className="guess-form" onSubmit={submit}>
              <label htmlFor="answer-input">Your answer</label>
              <div className="guess-form__field">
                <input
                  ref={inputRef}
                  id="answer-input"
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  placeholder="Type an answer…"
                  autoComplete="off"
                  autoCapitalize="sentences"
                  maxLength={80}
                />
                <button
                  type="submit"
                  aria-label="Submit answer"
                  disabled={guess.trim().length === 0}
                >
                  <ArrowIcon />
                </button>
              </div>
            </form>
            <div className="strike-panel">
              <span>Misses</span>
              <div aria-label={`${strikes} of ${MAX_STRIKES} misses`}>
                {Array.from({length: MAX_STRIKES}, (_, index) => (
                  <b
                    key={index}
                    className={index < strikes ? 'is-used' : ''}
                    aria-hidden="true"
                  >
                    ×
                  </b>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={onEndRound}
            >
              Pass &amp; reveal
            </button>
          </>
        )}
      </section>

      <div
        className={`feedback ${feedback ? `feedback--${feedback.tone}` : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback?.message ?? '\u00a0'}
      </div>
    </main>
  );
};

const ResultScreen = ({
  game,
  onCopied,
}: {
  game: SavedGame;
  onCopied: (copied: boolean) => void;
}) => {
  const [countdown, setCountdown] = useState(
    millisecondsUntilNextUtcDay(),
  );
  const [copied, setCopied] = useState(false);
  const possible = game.rounds.reduce(
    (sum, round) => sum + round.possible,
    0,
  );
  const percentage =
    possible > 0 ? Math.round((game.totalScore / possible) * 100) : 0;
  const answersFound = game.rounds.reduce(
    (sum, round) => sum + round.foundCount,
    0,
  );
  const totalAnswers = game.rounds.reduce(
    (sum, round) => sum + round.answerCount,
    0,
  );
  const rank =
    percentage >= 75
      ? 'Crowd whisperer'
      : percentage >= 50
        ? 'People person'
        : percentage >= 25
          ? 'Good instincts'
          : 'Bold thinker';

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(millisecondsUntilNextUtcDay());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const copyResult = async () => {
    const shareText = getShareText(
      game.challengeNumber,
      game.rounds,
      game.totalScore,
    );
    let succeeded = false;

    try {
      await navigator.clipboard.writeText(shareText);
      succeeded = true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      succeeded = document.execCommand('copy');
      textarea.remove();
    }

    setCopied(succeeded);
    onCopied(succeeded);
    if (succeeded) {
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <main className="screen screen--result">
      <section className="result-card">
        <div className="result-trophy">
          <TrophyIcon />
        </div>
        <span className="eyebrow eyebrow--center">Challenge complete</span>
        <h1>{rank}</h1>
        <p className="result-card__subhead">
          You finished today’s six questions.
        </p>

        <div className="final-score">
          <strong>{game.totalScore}</strong>
          <span>of {possible} points</span>
        </div>
        <div
          className="score-meter"
          aria-label={`${percentage} percent of available points`}
        >
          <span style={{width: `${percentage}%`}} />
        </div>
        <p className="percentage-label">{percentage}% of available points</p>

        <div className="result-grid" aria-label="Score by question">
          {game.rounds.map((round, index) => {
            const emoji = scoreEmoji(round);
            const tone =
              emoji === '🟩' ? 'strong' : emoji === '🟨' ? 'medium' : 'low';
            const label =
              tone === 'strong'
                ? 'Great round'
                : tone === 'medium'
                  ? 'Good round'
                  : 'Tough round';
            return (
              <div key={round.questionId}>
                <span>{index + 1}</span>
                <b
                  className={`result-tile result-tile--${tone}`}
                  aria-label={label}
                />
                <small>
                  {round.points}/{round.possible}
                </small>
              </div>
            );
          })}
        </div>

        <p className="found-summary">
          You uncovered <strong>{answersFound}</strong> of{' '}
          <strong>{totalAnswers}</strong> answers.
        </p>

        <button
          type="button"
          className={`button button--copy ${copied ? 'is-copied' : ''}`}
          onClick={copyResult}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied!' : 'Copy my result'}
        </button>

        <div className="next-feudle">
          <span>Next Feudle in</span>
          <strong>{formatCountdown(countdown)}</strong>
        </div>
      </section>
    </main>
  );
};

export const App = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<QuestionsFile | null>(null);
  const [game, setGame] = useState<SavedGame | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [toast, setToast] = useState('');
  const dayKey = getUtcDayKey();
  const challengeNumber = getChallengeNumber();

  const dailyQuestions = useMemo(
    () =>
      data ? getDailyQuestions(data.questions, dayKey, QUESTIONS_PER_DAY) : [],
    [data, dayKey],
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}questions.json`,
          {signal: controller.signal},
        );
        if (!response.ok) {
          throw new Error(`Question data returned ${response.status}.`);
        }
        const validated = validateQuestionsFile(await response.json());
        setData(validated);
        const saved = loadSavedGame(dayKey);
        if (saved) {
          setGame(saved);
          setPhase(saved.status === 'complete' ? 'result' : 'playing');
        } else {
          setPhase('intro');
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'The question data could not be loaded.',
        );
        setPhase('error');
      }
    };

    void load();
    return () => controller.abort();
  }, [dayKey]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const startGame = () => {
    const next = emptySavedGame(dayKey, challengeNumber);
    setGame(next);
    saveGame(next);
    setPhase('playing');
  };

  const updateGame = (updater: (current: SavedGame) => SavedGame) => {
    setGame((current) => {
      if (!current) return current;
      const next = updater(current);
      saveGame(next);
      return next;
    });
  };

  const guessAnswer = (guess: string) => {
    if (!game) return;
    const question = dailyQuestions[game.questionIndex];
    const answerIndex = findAnswerIndex(guess, question);
    const found = game.foundByQuestion[question.id] ?? [];

    if (answerIndex < 0) {
      const nextStrikes = Math.min(
        MAX_STRIKES,
        (game.strikesByQuestion[question.id] ?? 0) + 1,
      );
      updateGame((current) => ({
        ...current,
        strikesByQuestion: {
          ...current.strikesByQuestion,
          [question.id]: nextStrikes,
        },
      }));
      setFeedback({
        tone: 'wrong',
        message:
          nextStrikes === MAX_STRIKES
            ? 'Three misses — the board is revealed.'
            : 'Not on the board. Try another!',
      });
      return;
    }

    if (found.includes(answerIndex)) {
      setFeedback({
        tone: 'neutral',
        message: 'You already found that one.',
      });
      return;
    }

    const answer = question.answers[answerIndex];
    updateGame((current) => ({
      ...current,
      totalScore: current.totalScore + answer.points,
      foundByQuestion: {
        ...current.foundByQuestion,
        [question.id]: [...found, answerIndex],
      },
    }));
    setFeedback({
      tone: 'right',
      message: `Yes! ${answer.display} is worth ${answer.points} ${
        answer.points === 1 ? 'point' : 'points'
      }.`,
    });
  };

  const endRound = () => {
    if (!game) return;
    const question = dailyQuestions[game.questionIndex];
    updateGame((current) => ({
      ...current,
      strikesByQuestion: {
        ...current.strikesByQuestion,
        [question.id]: MAX_STRIKES,
      },
    }));
    setFeedback({tone: 'neutral', message: 'The rest of the board is revealed.'});
  };

  const nextQuestion = () => {
    if (!game) return;
    const question = dailyQuestions[game.questionIndex];
    const found = game.foundByQuestion[question.id] ?? [];
    const round: RoundResult = {
      questionId: question.id,
      points: found.reduce(
        (sum, answerIndex) => sum + question.answers[answerIndex].points,
        0,
      ),
      possible: question.answers.reduce(
        (sum, answer) => sum + answer.points,
        0,
      ),
      foundCount: found.length,
      answerCount: question.answers.length,
    };
    const nextRounds = [...game.rounds, round];

    if (game.questionIndex === QUESTIONS_PER_DAY - 1) {
      const complete: SavedGame = {
        ...game,
        rounds: nextRounds,
        status: 'complete',
      };
      setGame(complete);
      saveGame(complete);
      setFeedback(null);
      setPhase('result');
      return;
    }

    const next: SavedGame = {
      ...game,
      questionIndex: game.questionIndex + 1,
      rounds: nextRounds,
    };
    setGame(next);
    saveGame(next);
    setFeedback(null);
  };

  const showCopyToast = (copied: boolean) => {
    setToast(copied ? 'Result copied — ready to share!' : 'Could not copy result.');
  };

  return (
    <div className="app">
      <div className="motion-layer">
        <Player
          component={AmbientScene}
          inputProps={{celebrate: phase === 'result'}}
          durationInFrames={AMBIENT_DURATION_IN_FRAMES}
          compositionWidth={1440}
          compositionHeight={900}
          fps={30}
          autoPlay
          loop
          controls={false}
          initiallyMuted
          acknowledgeRemotionLicense
          style={{width: '100%', height: '100%'}}
        />
      </div>
      <Header
        onHelp={() => setShowHelp(true)}
        onStats={() => setShowStats(true)}
      />

      {phase === 'loading' && (
        <main className="screen screen--status">
          <div className="loader" aria-label="Loading today’s Feudle">
            <span />
            <span />
            <span />
          </div>
          <p>Loading today’s questions…</p>
        </main>
      )}
      {phase === 'error' && (
        <main className="screen screen--status">
          <div className="status-icon">!</div>
          <h1>Feudle hit a snag</h1>
          <p>{error}</p>
          <button
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </main>
      )}
      {phase === 'intro' && (
        <IntroScreen
          dayKey={dayKey}
          challengeNumber={challengeNumber}
          onStart={startGame}
        />
      )}
      {phase === 'playing' && game && dailyQuestions.length > 0 && (
        <GameScreen
          game={game}
          questions={dailyQuestions}
          feedback={feedback}
          onGuess={guessAnswer}
          onEndRound={endRound}
          onNext={nextQuestion}
        />
      )}
      {phase === 'result' && game && (
        <ResultScreen game={game} onCopied={showCopyToast} />
      )}

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      <div className={`toast ${toast ? 'toast--visible' : ''}`} role="status">
        {toast}
      </div>
      <footer>
        <span>Feudle</span>
        <i />
        <span>Come back tomorrow</span>
      </footer>
    </div>
  );
};
