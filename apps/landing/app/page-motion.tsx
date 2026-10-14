'use client';

import { useEffect } from 'react';

enum Field {
  Light = 'light',
  Accent = 'accent',
  Dark = 'dark',
}

const HEADER_LINE = 36;
const STAGGER_MS = 75;

/** The deepest field under the header line wins, so a field nested in a section overrides it. */
function fieldUnderHeader(fields: HTMLElement[]): Field {
  let current = Field.Light;
  for (const element of fields) {
    const box = element.getBoundingClientRect();
    if (box.top <= HEADER_LINE && box.bottom > HEADER_LINE) {
      const field = element.dataset.field;
      current = field === Field.Accent || field === Field.Dark ? field : Field.Light;
    }
  }
  return current;
}

/**
 * The page's motion layer: the header takes the ink of the chapter beneath it, and the parts of each
 * section enter once as they scroll in. Without script every element stays visible and in place.
 */
export function PageMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>('[data-header]');
    const sections = [...document.querySelectorAll<HTMLElement>('[data-field]')];

    let frame = 0;
    const updateInk = () => {
      frame = 0;
      if (header) header.dataset.ink = fieldUnderHeader(sections);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(updateInk);
    };
    updateInk();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let observer: IntersectionObserver | undefined;
    if (!reduced && 'IntersectionObserver' in window) {
      const parts = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
      const groupIndex = new Map<Element, number>();
      for (const part of parts) {
        const group = part.closest('section, footer') ?? document.body;
        const index = groupIndex.get(group) ?? 0;
        part.style.setProperty('--reveal-delay', `${index * STAGGER_MS}ms`);
        groupIndex.set(group, index + 1);
      }
      root.classList.add('motion');
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-in');
              observer?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
      );
      for (const part of parts) observer.observe(part);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
      observer?.disconnect();
      root.classList.remove('motion');
    };
  }, []);

  return null;
}
