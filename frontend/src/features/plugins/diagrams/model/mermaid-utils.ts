import mermaid from 'mermaid';

let initializedTheme: 'default' | 'dark' | null = null;

function shouldUseDarkTheme(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const root = document.documentElement;
  const body = document.body;
  const themeAttr = String(root.getAttribute('data-theme') ?? body?.getAttribute('data-theme') ?? '').toLowerCase();

  if (themeAttr.includes('dark')) {
    return true;
  }

  if (themeAttr.includes('light')) {
    return false;
  }

  if (root.classList.contains('dark') || body?.classList.contains('dark')) {
    return true;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
}

export function resolveMermaidTheme(): 'default' | 'dark' {
  return shouldUseDarkTheme() ? 'dark' : 'default';
}

function ensureMermaidInitialized(theme: 'default' | 'dark') {
  if (initializedTheme === theme) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    fontFamily: 'MTS Compact, Inter, sans-serif',
  });

  initializedTheme = theme;
}

function quoteFlowchartLabels(code: string): string {
  if (!/^\s*(flowchart|graph)\s+/im.test(code)) {
    return code;
  }

  return code
    .replace(/([A-Za-z0-9_-]+)\[([^\]"'][^\]\n]*[^\]"'])\]/g, (_match, id: string, label: string) => {
      return `${id}["${label.replace(/"/g, '\\"')}"]`;
    })
    .replace(/([A-Za-z0-9_-]+)\{([^}"'][^}\n]*[^}"'])\}/g, (_match, id: string, label: string) => {
      return `${id}{"${label.replace(/"/g, '\\"')}"}`;
    })
    .replace(/\|([^|"'\n][^|\n]*[^|"'\n])\|/g, (_match, label: string) => {
      return `|"${label.replace(/"/g, '\\"')}"|`;
    });
}

export function normalizeMermaidCode(inputCode: string) {
  return quoteFlowchartLabels(inputCode.trim());
}

export async function renderMermaidToSvg(inputCode: string, theme: 'default' | 'dark') {
  const code = normalizeMermaidCode(inputCode);
  if (!code) {
    return { svg: '', error: 'Код диаграммы пустой' };
  }

  ensureMermaidInitialized(theme);

  try {
    const renderId = `wikilive-mermaid-${crypto.randomUUID()}`;
    const { svg } = await mermaid.render(renderId, code);
    return { svg, error: '' };
  } catch (error) {
    return {
      svg: '',
      error: error instanceof Error ? error.message : 'Не удалось отрисовать диаграмму',
    };
  }
}
