'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import s from './landing.module.css';

const LETTERS = 'ScopeProfit'.split('');
const LIFT_AT_MS = 1350;
const REMOVE_AT_MS = 2100;

/**
 * Brand curtain: the wordmark rises letter by letter, then the curtain lifts and the hero
 * choreography starts (page-motion listens for the enter event). Without script the curtain
 * never displays; with reduced motion or a hash target it is skipped entirely.
 */
export function Preloader() {
  const [phase, setPhase] = useState<'show' | 'lift' | 'gone'>('show');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const entered = () => {
      (window as unknown as { __spEntered?: boolean }).__spEntered = true;
      window.dispatchEvent(new Event('scopeprofit:enter'));
    };
    if (reduced || window.location.hash) {
      const skip = window.setTimeout(() => {
        setPhase('gone');
        entered();
      }, 0);
      return () => window.clearTimeout(skip);
    }
    const lift = window.setTimeout(() => setPhase('lift'), LIFT_AT_MS);
    const remove = window.setTimeout(() => {
      setPhase('gone');
      entered();
    }, REMOVE_AT_MS);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(remove);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div
      className={`${s.preloader} ${phase === 'lift' ? s.preloaderLift : ''}`}
      data-preloader
      aria-hidden="true"
    >
      <p className={s.preloaderWord}>
        {LETTERS.map((letter, index) => (
          <span key={index} style={{ '--letter-index': index } as CSSProperties}>
            {letter}
          </span>
        ))}
      </p>
      <span className={s.preloaderMark} />
    </div>
  );
}
