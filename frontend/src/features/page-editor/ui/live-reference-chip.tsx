import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { wikiliveApi } from '../../../shared/api/wikilive';

const MIN_POLL_MS = 10_000;
const MAX_POLL_MS = 30_000;
const CHANGE_FLASH_MS = 1300;

function randomPollDelay() {
  return MIN_POLL_MS + Math.floor(Math.random() * (MAX_POLL_MS - MIN_POLL_MS));
}

function normalizeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDisplayValue(item))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    for (const key of ['text', 'title', 'name', 'value', 'label']) {
      const candidate = objectValue[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

export function LiveReferenceChip({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as {
    datasheetId?: string;
    recordId?: string;
    fieldId?: string;
    label?: string;
    value?: string;
    status?: 'idle' | 'loading' | 'ready' | 'error';
    updatedAt?: string;
    lastChangedAt?: number;
  };

  const { datasheetId, recordId, fieldId } = attrs;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChangedFlashVisible, setIsChangedFlashVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const currentValueRef = useRef(String(attrs.value ?? ''));

  const label = useMemo(() => {
    if (attrs.label && attrs.label.trim()) {
      return attrs.label;
    }

    return `${recordId ?? 'record'} / ${fieldId ?? 'field'}`;
  }, [attrs.label, fieldId, recordId]);

  const value = String(attrs.value ?? '').trim();

  useEffect(() => {
    currentValueRef.current = String(attrs.value ?? '');
  }, [attrs.value]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!attrs.lastChangedAt) {
      return;
    }

    setIsChangedFlashVisible(true);
    const timerId = window.setTimeout(() => {
      if (isMountedRef.current) {
        setIsChangedFlashVisible(false);
      }
    }, CHANGE_FLASH_MS);

    return () => window.clearTimeout(timerId);
  }, [attrs.lastChangedAt]);

  useEffect(() => {
    if (!datasheetId || !recordId || !fieldId) {
      return;
    }

    let cancelled = false;

    const schedule = () => {
      if (cancelled) {
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        void refresh();
      }, randomPollDelay());
    };

    const refresh = async () => {
      if (cancelled) {
        return;
      }

      setIsRefreshing(true);
      updateAttributes({ status: 'loading' });

      try {
        const response = await wikiliveApi.getMwsCellValue(datasheetId, recordId, fieldId);
        if (cancelled) {
          return;
        }

        const nextValue = normalizeDisplayValue(response.cell.displayValue ?? response.cell.value);
        const previousValue = currentValueRef.current;
        const hasChanged = nextValue !== previousValue;
        const nextAttrs: Record<string, unknown> = {
          value: nextValue,
          status: 'ready',
          updatedAt: response.cell.updatedAt ?? null,
        };

        if (hasChanged) {
          nextAttrs.lastChangedAt = Date.now();
        }

        updateAttributes(nextAttrs);
      } catch {
        if (!cancelled) {
          updateAttributes({ status: 'error' });
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
          schedule();
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [datasheetId, fieldId, recordId, updateAttributes]);

  return (
    <NodeViewWrapper
      as="span"
      data-type="live-reference"
      data-datasheet-id={datasheetId ?? ''}
      data-record-id={recordId ?? ''}
      data-field-id={fieldId ?? ''}
      className={[
        'live-reference-chip',
        attrs.status === 'error' ? 'is-error' : '',
        attrs.status === 'loading' || isRefreshing ? 'is-loading' : '',
        isChangedFlashVisible ? 'is-changed' : '',
      ].join(' ').trim()}
      title={`${label}: ${value || 'пусто'}`}
      contentEditable={false}
    >
      <span className="live-reference-chip__label">{label}</span>
      <span className="live-reference-chip__separator">:</span>
      <span className="live-reference-chip__value">{value || 'пусто'}</span>
    </NodeViewWrapper>
  );
}
