import {Component, lazy, Suspense, useEffect, useState, type ReactNode} from 'react';
import Home from './Home';
import './shared/base.css';
const Feudle = lazy(() => import('./games/feudle/Route'));
const Triviaire = lazy(() => import('./games/triviaire/Triviaire'));
const routeFromHash = () => window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '').toLowerCase();
class GameBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (this.state.failed) return <main className="wg-loading"><h1>The game couldn’t open.</h1><p>Please reload and try again. Your saved progress stays in this browser.</p><button className="wg-primary" onClick={() => window.location.reload()}>Reload</button><a href="#/">Back to all games</a></main>;
    return this.props.children;
  }
}
export function App() {
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const navigate = () => {setRoute(routeFromHash()); window.scrollTo({top: 0, behavior: 'instant'});};
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return <GameBoundary key={route}><Suspense fallback={<main className="wg-loading" aria-live="polite"><div className="wg-loader" /><h1>Setting the stage…</h1><a href="#/">Back to all games</a></main>}>
    {route === 'feudle' ? <Feudle /> : route === 'triviaire' ? <Triviaire /> : route === '' ? <Home /> : <main className="wg-loading"><h1>No game at this address.</h1><a className="wg-primary" href="#/">Choose a game</a></main>}
  </Suspense></GameBoundary>;
}
