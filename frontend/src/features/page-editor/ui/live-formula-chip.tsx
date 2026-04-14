import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  evaluateLiveFormula,
  extractFormulaRefTokens,
} from '../model/live-formula-evaluator';

type FormulaStatus = 'idle' | 'loading' | 'ready' | 'error';

const POLL_INTERVAL_MS = 1200;
const CHANGED_FLASH_MS = 1000;

function buildTokenKey(expression: string): string {
  const tokens = extractFormulaRefTokens(expression);
  return tokens
    .map((token) => `${token.datasheetId}:${token.recordId}:${token.fieldId}`)
    .join('|');
}

export function LiveFormulaChip({ node, updateAttributes }: NodeViewProps) {
  const expression = String(node.attrs.expression ?? '').trim();
  const currentResult = String(node.attrs.result ?? '').trim();
  const currentStatus = (String(node.attrs.status ?? 'idle') as FormulaStatus) || 'idle';
  const currentError = String(node.attrs.error ?? '').trim();
  const tokenKey = useMemo(() => buildTokenKey(expression), [expression]);

  const [isChanged, setIsChanged] = useState(false);
  const mountedRef = useRef(false);
  const isEvaluatingRef = useRef(false);
  const changedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (changedTimeoutRef.current) {
        window.clearTimeout(changedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!expression) {
      updateAttributes({
        status: 'error',
        error: 'Пустая формула',
        result: '',
      });
      return;
    }

    let cancelled = false;

    const evaluate = async () => {
      if (cancelled || isEvaluatingRef.current) {
        return;
      }
      isEvaluatingRef.current = true;

      updateAttributes({
        status: 'loading',
      });

      try {
        const result = await evaluateLiveFormula(expression);

        if (cancelled || !mountedRef.current) {
          return;
        }

        if (!result.ok) {
          const nextError = result.error || 'Ошибка вычисления';
          if (currentStatus !== 'error' || currentError !== nextError) {
            updateAttributes({
              status: 'error',
              error: nextError,
              result: '',
              updatedAt: new Date().toISOString(),
            });
          }
          return;
        }

        const nextResult = result.displayValue;
        const hasChanged = currentResult !== '' && currentResult !== nextResult;

        updateAttributes({
          status: 'ready',
          error: '',
          result: nextResult,
          updatedAt: new Date().toISOString(),
          lastChangedAt: hasChanged ? Date.now() : Number(node.attrs.lastChangedAt ?? 0),
        });

        if (hasChanged) {
          setIsChanged(true);
          if (changedTimeoutRef.current) {
            window.clearTimeout(changedTimeoutRef.current);
          }
          changedTimeoutRef.current = window.setTimeout(() => {
            setIsChanged(false);
          }, CHANGED_FLASH_MS);
        }
      } finally {
        isEvaluatingRef.current = false;
      }
    };

    void evaluate();
    const timer = window.setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    currentError,
    currentResult,
    currentStatus,
    expression,
    node.attrs.lastChangedAt,
    tokenKey,
    updateAttributes,
  ]);

  const display =
    currentStatus === 'error' ? 'Ошибка' : currentResult || (currentStatus === 'loading' ? '...' : '= ?');
  const tooltip = `Формула: ${expression || 'пусто'}\nРезультат: ${display}${
    currentError ? `\nОшибка: ${currentError}` : ''
  }`;

  return (
    <NodeViewWrapper
      as="span"
      className={[
        'live-formula-chip',
        currentStatus === 'loading' ? 'is-loading' : '',
        currentStatus === 'error' ? 'is-error' : '',
        isChanged ? 'is-changed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-status={currentStatus}
      data-expression={expression}
      title={tooltip}
    >
      <span className="live-formula-chip__prefix">ƒx</span>
      <span className="live-formula-chip__value">{display}</span>
    </NodeViewWrapper>
  );
}
