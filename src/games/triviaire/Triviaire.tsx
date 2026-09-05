import {useCallback, useEffect, useRef, useState} from 'react';
import {challengeNumber, countdown, displayDay} from '../../shared/daily';
import {Icon, Modal, TriviaireEmblem, useDailyClock, Wordmark} from '../../shared/ui';
import {correctCount, LETTERS, money, newGame, PRIZES, reduceGame, removedChoices, restoreGame, secured, shareText, STORAGE_PREFIX, validateBank, winnings, type Action, type Bank, type Choice, type Game, type Lifelines} from './engine';
import './triviaire.css';

const safeRead = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
function getStats(day: string, current: Game) {
  try {
    const completed: Game[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const game = restoreGame(localStorage.getItem(key), key.slice(STORAGE_PREFIX.length));
      if (game && game.status !== 'playing') completed.push(game);
    }
    if (!completed.some((g) => g.day === current.day)) completed.push(current);
    const dates = new Set(completed.map((g) => g.day));
    let streak = 0;
    let date = Date.parse(`${day}T00:00:00Z`);
    while (dates.has(new Date(date).toISOString().slice(0, 10))) {streak++; date -= 86_400_000;}
    return {played: completed.length, best: Math.max(0, ...completed.map(winnings)), streak};
  } catch { return {played: 0, best: 0, streak: 0}; }
}
function PrizeLadder({game}: {game: Game | null}) {
  const [open, setOpen] = useState(false);
  const correct = game ? correctCount(game) : 0;
  return <aside className={`tr-ladder ${open ? 'tr-ladder--open' : ''}`} aria-label="Prize ladder">
    <button className="tr-ladder-mobile-toggle" aria-expanded={open} aria-controls="prize-ladder" onClick={() => setOpen(!open)}><Icon name="trophy" /><span>The prize ladder</span><span>{open ? '−' : '+'}</span></button>
    <div id="prize-ladder" className="tr-ladder-content"><div className="tr-ladder-heading"><span>THE CLIMB</span><Icon name="trophy" /></div>
      <ol className="tr-ladder-list" reversed>{[...PRIZES].reverse().map((prize, reverseIndex) => {
        const i = 14 - reverseIndex;
        const current = game && game.phase !== 'result' && game.index === i;
        const safe = i === 4 || i === 9 || i === 14;
        return <li key={prize} className={`${current ? 'is-current' : ''} ${safe ? 'is-safe' : ''} ${i < correct ? 'is-earned' : ''}`} aria-current={current ? 'step' : undefined}>
          <span className="tr-step-number">{String(i + 1).padStart(2, '0')}</span><span className="tr-step-diamond" aria-hidden="true">{i < correct ? '✓' : '◆'}</span><strong>{money(prize)}</strong>{safe && <span className="tr-sr-only">{i === 14 ? ', top prize' : ', safety net'}</span>}
        </li>;
      })}</ol>
      <div className="tr-ladder-foot"><span>◆</span><p>Safety nets at<br /><b>$1,000</b> and <b>$32,000</b></p></div>
    </div>
  </aside>;
}
function HintPanel({game}: {game: Game}) {
  const audience = game.lifelines.audience?.at === game.index ? game.lifelines.audience : null;
  const phone = game.lifelines.phone?.at === game.index ? game.lifelines.phone : null;
  if (!audience && !phone) return null;
  return <div className="tr-hints" aria-live="polite">
    {audience && <section className="tr-hint-card"><div className="tr-hint-heading"><Icon name="people" /><h3>The audience has voted</h3><span>SIMULATED</span></div><div className="tr-poll">{audience.votes.map((vote, i) => <div key={i} className="tr-poll-column"><b>{vote}%</b><div className="tr-poll-track"><span style={{height: `${vote}%`}} /></div><span>{LETTERS[i]}</span></div>)}</div><p>A little help, not a guarantee. Trust your own judgment.</p></section>}
    {phone && <section className="tr-hint-card"><div className="tr-hint-heading"><Icon name="phone" /><h3>A friend on the line</h3><span>SIMULATED</span></div><blockquote>“I’m {phone.confidence}, but I’d go with <strong>{LETTERS[phone.choice]}: {game.deck[game.index].choices[phone.choice]}</strong>.”</blockquote><p>Your virtual friend can get it wrong, too.</p></section>}
  </div>;
}
function Results({game, remaining}: {game: Game; remaining: number}) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const stats = getStats(game.day, game);
  const won = game.status === 'won';
  useEffect(() => { heading.current?.focus(); }, []);
  const copy = async () => {
    const text = `${shareText(game)}\n\n${window.location.origin}${window.location.pathname}#/triviaire`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setManual(''); }
    catch { setManual(text); setCopied(false); }
  };
  return <section className={`tr-results ${won ? 'tr-results--won' : ''}`} aria-labelledby="tr-result-title">
    <div className="tr-result-icon"><Icon name="trophy" /></div><p className="tr-eyebrow">{won ? 'ALL THE WAY TO THE TOP' : 'DAILY CHALLENGE COMPLETE'}</p>
    <h1 ref={heading} tabIndex={-1} id="tr-result-title">{won ? 'You’re a Triviaire!' : game.status === 'walked' ? 'A smart exit.' : winnings(game) > 0 ? 'What a run.' : 'Until tomorrow.'}</h1>
    <p className="tr-result-description">{won ? 'Fifteen answers. One incredible climb. Take a bow.' : game.status === 'walked' ? 'You trusted your instincts and left with your winnings.' : 'The hot seat will be waiting. A new chance comes tomorrow.'}</p>
    <span className="tr-result-label">YOUR VIRTUAL WINNINGS</span><strong className="tr-result-money">{money(winnings(game))}</strong>
    <div className="tr-result-grid" aria-label={`${correctCount(game)} of 15 questions answered correctly`}>{game.deck.map((q, i) => <span key={q.id} className={i >= game.answers.length ? '' : game.answers[i] === q.answer ? 'is-right' : 'is-wrong'} aria-label={`Question ${i + 1}: ${i >= game.answers.length ? 'not reached' : game.answers[i] === q.answer ? 'correct' : 'incorrect'}`}>{i >= game.answers.length ? '·' : game.answers[i] === q.answer ? '✓' : '×'}</span>)}</div>
    <div className="tr-result-stats"><div><strong>{correctCount(game)}<small>/15</small></strong><span>Correct answers</span></div><div><strong>{Object.values(game.lifelines).filter(Boolean).length}<small>/3</small></strong><span>Lifelines used</span></div><div><strong>{Math.max(1, stats.streak)}</strong><span>Day streak</span></div></div>
    <button className="tr-gold-button tr-share-button" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied to clipboard!' : 'Share my result'}</button>
    <p className="tr-share-note" role="status">{copied ? 'Spoiler-free and ready to share.' : manual ? 'Copy isn’t available here. Select and copy your result below.' : 'A little friendly competition. No spoilers.'}</p>
    {manual && <textarea className="tr-share-fallback" aria-label="Your shareable result" readOnly value={manual} onFocus={(e) => e.currentTarget.select()} rows={9} />}
    <div className="tr-next"><Icon name="clock" /><span>Next hot seat in <b>{countdown(remaining)}</b></span><small>RESETS AT 00:00 UTC</small></div>
    <a className="tr-other-game" href="#/feudle">Keep your daily streak going with Feudle <Icon name="arrow" /></a>
  </section>;
}
function Session({bank, day, remaining, sound}: {bank: Bank; day: string; remaining: number; sound: boolean}) {
  const key = `${STORAGE_PREFIX}${day}`;
  const [game, setGame] = useState<Game | null>(() => restoreGame(safeRead(key), day));
  const [storageWarning, setStorageWarning] = useState(false);
  const [walkConfirm, setWalkConfirm] = useState(false);
  const [restoredInvalid] = useState(() => Boolean(safeRead(key)) && !restoreGame(safeRead(key), day));
  const heading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const previousAnswers = useRef(game?.answers.length ?? 0);
  const send = useCallback((action: Action) => setGame((current) => current ? reduceGame(current, action) : current), []);
  useEffect(() => {
    try {
      if (game) localStorage.setItem(key, JSON.stringify(game));
      else {localStorage.setItem('triviaire:storage-check', '1'); localStorage.removeItem('triviaire:storage-check');}
    } catch { setStorageWarning(true); }
  }, [game, key]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return;
      const saved = restoreGame(event.newValue, day);
      if (saved) setGame(saved);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key, day]);
  useEffect(() => { if (game?.phase === 'question') heading.current?.focus(); }, [game?.index, game?.phase]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!game || game.phase !== 'question' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      const number = 'abcd'.indexOf(event.key.toLowerCase());
      if (number >= 0) { event.preventDefault(); send({type: 'select', choice: number as Choice}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, send]);
  useEffect(() => {
    const count = game?.answers.length ?? 0;
    if (sound && game && count > previousAnswers.current) {
      try {
        const ctx = audio.current ?? new AudioContext(); audio.current = ctx;
        void ctx.resume();
        const right = game.answers[count - 1] === game.deck[count - 1].answer;
        const start = ctx.currentTime;
        (right ? [523.25, 659.25, 783.99] : [220, 174.61]).forEach((frequency, i) => {
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          const t = start + i * 0.1;
          gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.08, t + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(t); oscillator.stop(t + 0.4);
          oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
        });
      } catch { /* Audio is optional; denied audio permissions never affect play. */ }
    }
    previousAnswers.current = count;
  }, [game, sound]);
  useEffect(() => () => {void audio.current?.close();}, []);
  const q = game?.deck[game.index];
  const reveal = game?.phase === 'reveal';
  const hidden = game ? removedChoices(game) : [];
  return <>
    {storageWarning && <p className="tr-notice" role="status">This browser can’t save progress. Keep this tab open to finish your challenge.</p>}
    {restoredInvalid && !game && <p className="tr-notice" role="status">Your previous save couldn’t be restored. You can start today’s challenge again.</p>}
    <div className="tr-layout"><main className="tr-stage" id="tr-main">
      <div className="tr-challenge-bar"><span className="tr-daily-badge"><i /> DAILY CHALLENGE <b>#{String(challengeNumber(day)).padStart(3, '0')}</b></span><span className="tr-date">{displayDay(day)} <b>· UTC</b></span></div>
      {!game ? <section className="tr-intro" aria-labelledby="tr-intro-title"><TriviaireEmblem /><p className="tr-eyebrow">FIFTEEN QUESTIONS. ONE SHOT AT A MILLION.</p><h1 id="tr-intro-title">The hot seat is yours.</h1><p className="tr-intro-description">A little knowledge. A little courage. One final answer.<br />How far will you go today?</p><button className="tr-gold-button tr-start" onClick={() => setGame(newGame(bank, day))}>Take the hot seat <Icon name="arrow" /></button><div className="tr-intro-facts"><span><b>15</b> questions</span><i /><span><b>3</b> lifelines</span><i /><span><b>1</b> daily attempt</span></div><p className="tr-intro-note">No timer. No real money. Just the thrill of the climb.</p></section>
      : game.phase === 'result' ? <Results game={game} remaining={remaining} />
      : <section className="tr-playing" aria-labelledby="tr-question">
          <div className="tr-game-top"><TriviaireEmblem small /><div className="tr-playing-prize"><span>PLAYING FOR</span><strong>{money(PRIZES[game.index])}</strong><p><span>◆</span> {money(secured(correctCount(game)))} guaranteed</p></div></div>
          <div className="tr-lifelines" aria-label="Lifelines">{(['fifty', 'audience', 'phone'] as (keyof Lifelines)[]).map((name) => {
            const used = Boolean(game.lifelines[name]);
            const label = name === 'fifty' ? '50:50' : name === 'audience' ? 'Ask the audience' : 'Phone a friend';
            return <button key={name} className={`tr-lifeline ${used ? 'is-used' : ''}`} disabled={used || reveal} onClick={() => send({type: 'lifeline', name})} aria-label={`${label}${used ? ' — used' : ''}`} title={name === 'fifty' ? 'Remove two incorrect answers' : 'A simulated hint that may be wrong'}><span className="tr-lifeline-symbol">{name === 'fifty' ? <b>50:50</b> : <Icon name={name === 'audience' ? 'people' : 'phone'} />}{used && <span className="tr-lifeline-slash" />}</span><span>{used ? 'Used' : label}</span></button>;
          })}</div>
          <div className="tr-question-meta"><span>QUESTION <b>{String(game.index + 1).padStart(2, '0')}</b> / 15</span><span>GENERAL KNOWLEDGE</span></div>
          <div className="tr-question-frame"><div className="tr-question-inner"><h1 id="tr-question" ref={heading} tabIndex={-1}>{q!.prompt}</h1></div></div>
          <div className="tr-answers" role="group" aria-label="Choose your answer">{q!.choices.map((choice, i) => {
            const removed = hidden.includes(i as Choice);
            const right = reveal && i === q!.answer;
            const wrong = reveal && i === game.selected && i !== q!.answer;
            const selected = game.selected === i;
            return <button key={`${q!.id}:${i}`} className={`tr-answer ${selected ? 'is-selected' : ''} ${removed ? 'is-removed' : ''} ${right ? 'is-right' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={removed || reveal} aria-pressed={selected} aria-label={removed ? `${LETTERS[i]}: answer removed by 50:50` : `${LETTERS[i]}: ${choice}${right ? ', correct answer' : wrong ? ', incorrect answer' : ''}`} onClick={() => send({type: 'select', choice: i as Choice})}><span className="tr-answer-inner"><b>{LETTERS[i]}<span>:</span></b><span>{removed ? '—' : choice}</span>{right ? <Icon name="check" /> : wrong ? <Icon name="close" /> : selected ? <span className="tr-selected-dot" /> : null}</span></button>;
          })}</div>
          {reveal ? <div className={`tr-feedback ${game.status === 'lost' ? 'tr-feedback--wrong' : ''}`}><div role="status"><Icon name={game.status === 'lost' ? 'close' : 'check'} /><p><strong>{game.status === 'won' ? 'One million. You did it!' : game.status === 'lost' ? 'That’s not the answer.' : game.index === 4 || game.index === 9 ? 'Correct — safety net secured!' : 'That’s the right answer!'}</strong><span>{game.status === 'lost' ? `The correct answer is ${LETTERS[q!.answer]}: ${q!.choices[q!.answer]}. You leave with ${money(winnings(game))}.` : `${money(winnings(game))} is yours${game.status === 'playing' ? '. Ready to keep climbing?' : '.'}`}</span></p></div><button className="tr-gold-button" onClick={() => send({type: 'next'})}>{game.status === 'playing' ? 'Next question' : 'See my result'}<Icon name="arrow" /></button></div>
          : <div className="tr-actions"><button className="tr-walk-button" onClick={() => setWalkConfirm(true)}>Walk away <span>with {money(winnings(game))}</span></button><button className="tr-gold-button tr-lock-button" disabled={game.selected === null} onClick={() => send({type: 'answer'})}>Final answer <Icon name="check" /></button></div>}
          <HintPanel game={game} />
          {!reveal && <p className="tr-keyboard-note">Choose carefully. Your answer is only locked when you press <b>Final answer.</b><span>A–D to choose · No time limit</span></p>}
        </section>}
    </main><PrizeLadder game={game} /></div>
    {walkConfirm && game && <Modal title="Time to walk away?" dark onClose={() => setWalkConfirm(false)}><p>You’ll finish today’s challenge with <strong>{money(winnings(game))}</strong> in virtual winnings. There’s no second attempt today.</p><p>Keep playing, and the next question is worth <strong>{money(PRIZES[game.index])}</strong>. A wrong answer takes you back to <strong>{money(secured(correctCount(game)))}</strong>.</p><div className="tr-dialog-actions"><button className="tr-secondary-button" onClick={() => setWalkConfirm(false)}>Stay in the hot seat</button><button className="tr-gold-button" onClick={() => {send({type: 'walk'}); setWalkConfirm(false);}}>Take {money(winnings(game))}</button></div></Modal>}
  </>;
}
export default function Triviaire() {
  const {day, remaining} = useDailyClock();
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const previousDay = useRef(day);
  const [rolledOver, setRolledOver] = useState(false);
  useEffect(() => {
    document.title = 'Who Wants to Be a Triviaire — Webgames';
    const controller = new AbortController();
    setError('');
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}games/triviaire/questions.json`, {signal: controller.signal});
        if (!response.ok) throw new Error(`Question pack returned ${response.status}.`);
        setBank(validateBank(await response.json()));
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to load questions.');
      }
    })();
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (previousDay.current !== day) { setRolledOver(true); previousDay.current = day; }
  }, [day]);
  return <div className="tr-shell">
    <header className="tr-header"><a className="tr-back" href="#/"><Icon name="back" /><span>All games</span></a><Wordmark /><nav aria-label="Triviaire options"><button onClick={() => setSound(!sound)} className="tr-header-button" aria-label={sound ? 'Turn sound off' : 'Turn sound on'} aria-pressed={sound}><Icon name={sound ? 'sound' : 'mute'} /><span>Sound {sound ? 'on' : 'off'}</span></button><button onClick={() => setHelp(true)} className="tr-header-button" aria-label="How to play"><Icon name="help" /><span>How to play</span></button></nav></header>
    <div className="tr-content">
      {rolledOver && <div className="tr-notice" role="status">A new UTC day, a fresh hot seat. Today’s challenge is ready.<button onClick={() => setRolledOver(false)} aria-label="Dismiss new challenge message"><Icon name="close" /></button></div>}
      {error ? <main className="tr-load-state"><Icon name="help" /><h1>The questions couldn’t load.</h1><p>{error}</p><button className="tr-gold-button" onClick={() => setReload((n) => n + 1)}>Try again</button><a href="#/">Back to all games</a></main>
      : bank ? <Session key={day} bank={bank} day={day} remaining={remaining} sound={sound} />
      : <main className="tr-load-state" aria-live="polite"><div className="wg-loader" /><h1>Setting the stage…</h1><p>Getting today’s questions ready.</p></main>}
    </div>
    <footer className="tr-footer"><span>15 questions. Three lifelines. One final answer.</span><p>An independent, unofficial trivia game. Virtual prizes only.</p><a href="#/">A WEBGAMES DAILY CHALLENGE <span>↗</span></a></footer>
    {help && <Modal title="So, you want to be a Triviaire?" dark onClose={() => setHelp(false)}><p>Answer 15 multiple-choice questions to climb from $100 to a virtual $1,000,000. Everyone gets the same daily questions, and there’s no timer.</p><div className="wg-help-rule"><Icon name="check" /><p><strong>Make it your final answer.</strong>Select A, B, C, or D, then press Final answer to lock it in. One wrong answer ends your daily run.</p></div><div className="wg-help-rule"><Icon name="trophy" /><p><strong>Protect your winnings.</strong>Questions 5 and 10 secure $1,000 and $32,000. Walk away before answering to keep your current prize.</p></div><div className="wg-help-rule"><Icon name="people" /><p><strong>Three lifelines. One use each.</strong>50:50 removes two wrong answers. Ask the audience and Phone a friend give simulated hints that can be wrong. They don’t contact real people.</p></div><div className="wg-help-rule"><Icon name="clock" /><p><strong>One hot seat every day.</strong>The challenge resets at 00:00 UTC, including in an open tab. Progress is saved in this browser. Returning to an unfinished game resumes it.</p></div><p className="tr-help-note">Questions come from the supplied community sheet. The pack has no difficulty ratings: the stakes increase, but question difficulty is mixed. All winnings are imaginary; this game is not affiliated with the television show.</p><button className="tr-gold-button" onClick={() => setHelp(false)}>I’m ready <Icon name="arrow" /></button></Modal>}
  </div>;
}
