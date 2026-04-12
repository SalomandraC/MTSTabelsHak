import type { ReactNode } from 'react';

function tryParseJson(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

function formatJsonValue(value: unknown): ReactNode {
  if (value === null) {
    return <span className="text-[#8a4b00]">null</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-[#0f6bcb]">&quot;{value}&quot;</span>;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return <span className="text-[#7c3aed]">{String(value)}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[#b54708]">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-1">
        <span className="text-[#667085]">[</span>
        <div className="pl-4">
          {value.map((item, index) => (
            <div key={`${index}-${typeof item}`} className="leading-5">
              {formatJsonValue(item)}{index < value.length - 1 ? <span className="text-[#667085]">,</span> : null}
            </div>
          ))}
        </div>
        <span className="text-[#667085]">]</span>
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    return (
      <div className="space-y-1">
        <span className="text-[#667085]">{'{'}</span>
        <div className="pl-4">
          {entries.map(([key, item], index) => (
            <div key={key} className="leading-5">
              <span className="text-[#d92d20]">&quot;{key}&quot;</span>
              <span className="text-[#667085]">: </span>
              {formatJsonValue(item)}
              {index < entries.length - 1 ? <span className="text-[#667085]">,</span> : null}
            </div>
          ))}
        </div>
        <span className="text-[#667085]">{'}'}</span>
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(!?\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    if (token.startsWith('![')) {
      parts.push(token);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={`${index}-${token}`} href={linkMatch[2]} className="text-[#1f3fff] underline" target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith('**') || token.startsWith('__')) {
      const inner = token.slice(2, -2);
      parts.push(
        <strong key={`${index}-${token}`} className="font-semibold text-[#101828]">
          {inner}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={`${index}-${token}`} className="rounded bg-[#eef2ff] px-1 py-0.5 font-mono text-[0.92em] text-[#343a40]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      const inner = token.slice(1, -1);
      parts.push(
        <em key={`${index}-${token}`} className="italic text-[#1d2023]">
          {inner}
        </em>,
      );
    } else {
      parts.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function isProbablyJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  return (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.includes('```json') ||
    trimmed.includes('"summary"') ||
    trimmed.includes('"commands"') ||
    trimmed.includes('"answer"')
  );
}

function splitMarkdownBlocks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function renderMarkdownBlock(block: string, index: number) {
  if (/^```/.test(block)) {
    const fenced = block.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
    const content = fenced?.[1] ?? block.replace(/^```(?:\w+)?/, '').replace(/```$/, '').trim();
    const parsed = tryParseJson(content);

    if (parsed !== null && typeof parsed === 'object') {
      return (
        <div key={index} className="rounded-lg border border-[#d8e0f0] bg-[#f8fbff] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5b6b84]">JSON</div>
          <div className="overflow-auto rounded-md bg-white p-3 font-mono text-[11px] leading-5 text-[#101828]">
            {formatJsonValue(parsed)}
          </div>
        </div>
      );
    }

    return (
      <pre key={index} className="overflow-auto rounded-lg border border-[#e5e7eb] bg-[#111827] p-3 font-mono text-[11px] leading-5 text-[#f9fafb]">
        {content}
      </pre>
    );
  }

  if (isProbablyJson(block)) {
    const parsed = tryParseJson(block);
    if (parsed !== null && typeof parsed === 'object') {
      return (
        <div key={index} className="rounded-lg border border-[#d8e0f0] bg-[#f8fbff] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5b6b84]">JSON</div>
          <div className="overflow-auto rounded-md bg-white p-3 font-mono text-[11px] leading-5 text-[#101828]">
            {formatJsonValue(parsed)}
          </div>
        </div>
      );
    }
  }

  const lines = block.split('\n').map((line) => line.trimEnd());

  if (lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul key={index} className="space-y-1 pl-5">
        {lines.map((line, lineIndex) => (
          <li key={`${index}-${lineIndex}`} className="list-disc text-[#1d2023]">
            {renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}
          </li>
        ))}
      </ul>
    );
  }

  if (lines.length > 1 && lines.every((line) => /^\d+\.\s+/.test(line))) {
    return (
      <ol key={index} className="space-y-1 pl-5">
        {lines.map((line, lineIndex) => (
          <li key={`${index}-${lineIndex}`} className="list-decimal text-[#1d2023]">
            {renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}
          </li>
        ))}
      </ol>
    );
  }

  if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
    const level = Math.min(6, lines[0].match(/^#{1,6}/)?.[0].length ?? 1);
    const textContent = lines[0].replace(/^#{1,6}\s+/, '');
    const headingClasses = ['text-[20px]', 'text-[18px]', 'text-[16px]', 'text-[15px]', 'text-[14px]', 'text-[13px]'];

    return (
      <h4 key={index} className={`leading-6 font-semibold tracking-[-0.01em] text-[#101828] ${headingClasses[level - 1]}`}>
        {renderInlineMarkdown(textContent)}
      </h4>
    );
  }

  if (lines.length === 1 && /^>\s+/.test(lines[0])) {
    return (
      <blockquote key={index} className="rounded-r-md border-l-2 border-[#cbd5e1] bg-[#f8fafc] px-3 py-2 italic text-[#4b5563]">
        {renderInlineMarkdown(lines[0].replace(/^>\s+/, ''))}
      </blockquote>
    );
  }

  if (lines.length === 1 && /^(-{3,}|\*{3,}|_{3,})$/.test(lines[0].trim())) {
    return <hr key={index} className="my-2 border-[#e5e7eb]" />;
  }

  if (lines.length === 1 && /^\*\*[^*]+\*\*\.?\s*/.test(lines[0])) {
    const headingMatch = lines[0].match(/^\*\*([^*]+)\*\*\.?\s*(.*)$/);
    if (headingMatch) {
      return (
        <div key={index} className="space-y-1">
          <p className="text-[14px] font-semibold leading-5 text-[#101828]">{headingMatch[1]}</p>
          {headingMatch[2] ? <p className="leading-5 text-[#1d2023]">{renderInlineMarkdown(headingMatch[2])}</p> : null}
        </div>
      );
    }
  }

  return (
    <p key={index} className="whitespace-pre-wrap leading-5 text-[#1d2023]">
      {renderInlineMarkdown(block)}
    </p>
  );
}

export function AiOutputView({ text }: { text: string }) {
  const blocks = splitMarkdownBlocks(text);

  if (blocks.length === 0) {
    return <p>Ответ AI или статус выполнения появится здесь.</p>;
  }

  return <div className="space-y-3">{blocks.map(renderMarkdownBlock)}</div>;
}

export function getPrettyJsonText(text: string): string | null {
  const parsed = tryParseJson(text);
  if (parsed === null) {
    return null;
  }

  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}
