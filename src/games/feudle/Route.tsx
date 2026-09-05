import {useEffect} from 'react';
import {App} from './App';
import styles from './styles.css?inline';
export default function FeudleRoute() {
  useEffect(() => { document.title = 'Feudle — Webgames'; }, []);
  return <><style>{styles}</style><nav className="wg-feudle-nav" aria-label="Game navigation"><a href="#/">← All games</a><a href="#/triviaire">Try Triviaire ↗</a></nav><App /></>;
}
