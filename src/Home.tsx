import {useEffect, useState} from 'react';
import {countdown, displayDay} from './shared/daily';
import {Icon, Modal, TriviaireEmblem, useDailyClock, Wordmark} from './shared/ui';
import './hub.css';

function readProgress(game: 'feudle' | 'triviaire', day: string): 'new' | 'playing' | 'complete' {
  try {
    const prefix = game === 'feudle' ? 'feudle:game:' : 'triviaire:daily:';
    const raw = localStorage.getItem(`${prefix}${day}`);
    if (!raw) return 'new';
    const value = JSON.parse(raw);
    if (game === 'feudle' && (value.version !== 2 || value.dayKey !== day)) return 'new';
    if (game === 'triviaire' && (value.version !== 1 || value.day !== day)) return 'new';
    return value.status === 'playing' ? 'playing' : 'complete';
  } catch { return 'new'; }
}
export default function Home() {
  const {day, remaining} = useDailyClock();
  const [help, setHelp] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    document.title = 'Webgames — A little play. Every day.';
    const sync = () => setRefresh((n) => n + 1);
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const status = {feudle: readProgress('feudle', day), triviaire: readProgress('triviaire', day)};
  const cta = (game: 'feudle' | 'triviaire') => status[game] === 'complete' ? 'View today’s result' : status[game] === 'playing' ? 'Continue playing' : 'Play today’s challenge';
  return <div className="wg-home" data-refresh={refresh}>
    <a className="wg-skip" href="#lineup" onClick={(e) => {e.preventDefault(); document.getElementById('lineup')?.focus();}}>Skip to games</a>
    <header className="wg-header"><Wordmark /><nav aria-label="Main navigation"><span className="wg-header-note"><i /> A fresh challenge, every day</span><button className="wg-text-btn" onClick={() => setHelp(true)}>How it works <Icon name="help" /></button></nav></header>
    <main className="wg-main">
      <section className="wg-intro" aria-label="Today’s lineup">
        <div className="wg-daily-stamp"><span className="wg-stamp-label"><Icon name="clock" /> TODAY’S LINEUP</span><strong>{displayDay(day)}</strong><span>Two games. Two fresh challenges.</span><div className="wg-stamp-reset">Next reset <b>{countdown(remaining)}</b><small>00:00 UTC</small></div></div>
      </section>
      <section id="lineup" className="wg-lineup" tabIndex={-1} aria-labelledby="lineup-title">
        <div className="wg-section-heading"><h2 id="lineup-title">Choose your daily challenge</h2><span>02 GAMES · ALL GOOD FUN</span></div>
        <div className="wg-cards">
          <article className="wg-game-card wg-game-card--feudle">
            <a className="wg-game-art wg-feudle-art" href="#/feudle" aria-label="Play Feudle">
              <span className="wg-art-tag"><span /> THE CROWD FAVORITE</span><span className="wg-art-index">01 /</span>
              <div className="wg-feudle-visual" aria-hidden="true"><div className="wg-feudle-word"><span>F</span>eudle<span className="wg-feudle-spark">✳</span></div><div className="wg-mini-board"><div><span>1</span><b>GOOD TIMES</b><em>42</em></div><div><span>2</span><b>GREAT GUESSES</b><em>28</em></div><div><span>3</span><i>?</i></div></div><div className="wg-feudle-sticker">SURVEY<br /><b>SAYS…</b></div></div>
            </a>
            <div className="wg-game-info"><p className="wg-game-kicker">WORDS & INSTINCT <span>•</span> 4 DAILY QUESTIONS</p><h3>Feudle<span className={`wg-progress wg-progress--${status.feudle}`}>{status.feudle === 'complete' ? 'Played today' : status.feudle === 'playing' ? 'In progress' : 'Daily'}</span></h3><p>Think like the crowd. Find the most popular answers before three strikes send you packing.</p><a className="wg-play-link" href="#/feudle">{cta('feudle')}<span><Icon name="arrow" /></span></a></div>
          </article>
          <article className="wg-game-card wg-game-card--triviaire">
            <a className="wg-game-art wg-triviaire-art" href="#/triviaire" aria-label="Play Who Wants to Be a Triviaire">
              <span className="wg-art-tag wg-art-tag--gold"><Icon name="spark" /> NEW TO THE LINEUP</span><span className="wg-art-index">02 /</span>
              <div className="wg-triviaire-visual"><TriviaireEmblem /><div className="wg-million-pill" aria-hidden="true">15 QUESTIONS <span>◆</span> $1 MILLION</div></div>
            </a>
            <div className="wg-game-info"><p className="wg-game-kicker">GENERAL KNOWLEDGE <span>•</span> 15 DAILY QUESTIONS</p><h3><span className="wg-triviaire-title"><small>Who Wants to Be a</small>Triviaire</span><span className={`wg-progress wg-progress--${status.triviaire}`}>{status.triviaire === 'complete' ? 'Played today' : status.triviaire === 'playing' ? 'In progress' : 'Daily'}</span></h3><p>Take the hot seat. Trust your knowledge, use your lifelines, and climb all the way to a million.</p><a className="wg-play-link" href="#/triviaire">{cta('triviaire')}<span><Icon name="arrow" /></span></a></div>
          </article>
        </div>
      </section>
    </main>
    {help && <Modal title="Your daily dose of play" onClose={() => setHelp(false)}><p>Choose a game, take on today’s challenge, and share your spoiler-free result with friends.</p><div className="wg-help-rule"><Icon name="clock" /><p><strong>A fresh start at midnight UTC.</strong> Each game has one challenge per day, with the same questions for everyone using the current question pack.</p></div><div className="wg-help-rule"><Icon name="check" /><p><strong>Your progress stays here.</strong> Games save in this browser automatically. No account is needed; progress does not sync between devices.</p></div><div className="wg-help-rule"><Icon name="trophy" /><p><strong>Nothing to lose.</strong> All prizes are imaginary. These are independent, unofficial games made for fun.</p></div><button className="wg-primary" onClick={() => setHelp(false)}>Let’s play <Icon name="arrow" /></button></Modal>}
  </div>;
}
