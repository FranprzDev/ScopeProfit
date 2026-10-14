'use client';

import { useId, useState } from 'react';
import { findTools } from '@/lib/tool-finder';
import {
  KIND_LABEL,
  TOOL_FINDER_DEFAULT,
  TOOL_FINDER_EXAMPLES,
  TOOL_GROUPS,
  ToolKind,
} from './content';
import s from './landing.module.css';

const kindClass: Record<ToolKind, string> = {
  [ToolKind.Read]: s.kindRead,
  [ToolKind.Write]: s.kindWrite,
  [ToolKind.Destructive]: s.kindDestructive,
};

export function ToolFinder() {
  const [query, setQuery] = useState(TOOL_FINDER_DEFAULT);
  const inputId = useId();
  const answerId = useId();
  const matches = findTools(query, TOOL_GROUPS);

  return (
    <div className={s.finder}>
      <label htmlFor={inputId} className="sr-only">
        Lo que le pedirías a tu asistente
      </label>
      <input
        id={inputId}
        data-ui
        className={s.finderInput}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-controls={answerId}
        autoComplete="off"
        spellCheck={false}
      />
      <p className={s.finderHint} data-reveal>
        Escribí lo que le pedirías a tu asistente y mirá qué herramienta de ScopeProfit usaría.
      </p>
      <div id={answerId} className={s.finderAnswer} data-ui aria-live="polite" data-reveal>
        {matches.length === 0 ? (
          <p className={s.finderEmpty}>
            Ninguna herramienta coincide. Probá con palabras como alcance, preguntas o exportar.
          </p>
        ) : (
          <ul className={s.finderList}>
            {matches.map(({ tool, group }) => (
              <li key={tool.name} className={s.finderRow}>
                <div className={s.finderRowHead}>
                  <code className={s.finderName}>{tool.name}</code>
                  <span className={`${s.kind} ${kindClass[tool.kind]}`}>
                    {KIND_LABEL[tool.kind]}
                  </span>
                </div>
                <p className={s.finderText}>{tool.text}</p>
                <p className={s.finderGroup}>{group}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={s.finderExamples} data-reveal>
        {TOOL_FINDER_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className={s.finderExample}
            onClick={() => setQuery(example)}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
