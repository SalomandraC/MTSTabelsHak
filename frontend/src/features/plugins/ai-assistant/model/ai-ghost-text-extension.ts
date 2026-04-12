import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

type AIGhostTextOptions = {
  debounceMs: number;
  minChars: number;
  fetchCompletion: (currentText: string) => Promise<string>;
};

type AIGhostTextStorage = {
  suggestion: string;
  requestId: number;
  anchorPos: number | null;
};

type CopilotVisibilityEvent = CustomEvent<{ open: boolean }>;

const ghostTextPluginKey = new PluginKey<DecorationSet>('aiGhostTextPlugin');

function isCopilotOpen(): boolean {
  const globalFlags = window as unknown as { __wikiliveCopilotOpen?: boolean };
  return Boolean(globalFlags.__wikiliveCopilotOpen);
}

function clearSuggestion(instance: {
  storage: { suggestion: string; requestId: number; anchorPos: number | null };
  editor: { state: any; view: { dispatch: (transaction: any) => void } };
}) {
  instance.storage.requestId += 1;
  instance.storage.anchorPos = null;

  if (!instance.storage.suggestion) {
    return;
  }

  instance.storage.suggestion = '';
  instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
}

function buildSuggestionForCursor(editor: any, suggestion: string): string {
  const selection = editor.state.selection;
  const from = selection.to;
  const previousChar = editor.state.doc.textBetween(Math.max(0, from - 1), from, '', '');
  const trimmedSuggestion = suggestion.trimStart();

  if (!trimmedSuggestion) {
    return '';
  }

  const startsWithPunctuation = /^[,.;:!?)]/.test(trimmedSuggestion);
  const needsLeadingSpace = previousChar.length > 0 && !/\s/.test(previousChar) && !startsWithPunctuation;

  return needsLeadingSpace ? ` ${trimmedSuggestion}` : trimmedSuggestion;
}

function countTrailingSpacesBeforeCursor(editor: any): number {
  const selection = editor.state.selection;
  const cursorPos = selection.to;
  const scanFrom = Math.max(0, cursorPos - 64);
  const chunk = editor.state.doc.textBetween(scanFrom, cursorPos, '', '');

  let count = 0;
  for (let i = chunk.length - 1; i >= 0; i -= 1) {
    if (chunk[i] !== ' ') {
      break;
    }

    count += 1;
  }

  return count;
}

function buildDecorations(editor: any, suggestion: string, anchorPos: number | null): DecorationSet {
  if (isCopilotOpen()) {
    return DecorationSet.empty;
  }

  const state = editor.state;
  const selection = state.selection;

  if (!suggestion || !selection.empty || anchorPos === null || selection.to !== anchorPos) {
    return DecorationSet.empty;
  }

  const preview = buildSuggestionForCursor(editor, suggestion);
  if (!preview) {
    return DecorationSet.empty;
  }

  const widget = Decoration.widget(selection.to, () => {
    const span = document.createElement('span');
    span.className = 'ai-ghost-text-hint';
    span.textContent = preview;
    span.title = 'Tab, чтобы принять';
    return span;
  });

  return DecorationSet.create(state.doc, [widget]);
}

function scheduleGhostSuggestion(instance: {
  storage: { suggestion: string; requestId: number; anchorPos: number | null };
  options: { minChars: number; debounceMs: number; fetchCompletion: (currentText: string) => Promise<string> };
  editor: {
    isEditable: boolean;
    state: any;
    view: { dispatch: (transaction: any) => void };
  };
  __aiGhostTimer?: number;
}) {
  if (isCopilotOpen()) {
    clearSuggestion(instance);
    return;
  }

  const selection = instance.editor.state.selection;
  if (!selection.empty) {
    return;
  }

  const currentText = instance.editor.state.doc.textBetween(Math.max(0, selection.to - 1200), selection.to, '\n', ' ');

  if (currentText.trim().length < instance.options.minChars) {
    if (instance.storage.suggestion) {
      instance.storage.suggestion = '';
      instance.storage.requestId += 1;
      instance.storage.anchorPos = null;
      instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
    }
    return;
  }

  const expectedPos = selection.to;
  const requestId = instance.storage.requestId + 1;
  instance.storage.requestId = requestId;

  window.clearTimeout(instance.__aiGhostTimer);
  instance.__aiGhostTimer = window.setTimeout(() => {
    void instance.options.fetchCompletion(currentText).then((nextSuggestion) => {
      if (instance.storage.requestId !== requestId) {
        return;
      }

      const normalized = nextSuggestion.trim();
      if (!normalized) {
        if (instance.storage.suggestion) {
          instance.storage.suggestion = '';
          instance.storage.anchorPos = null;
          instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        }
        return;
      }

      if (
        isCopilotOpen()
        || !instance.editor.isEditable
        || !instance.editor.state.selection.empty
        || instance.editor.state.selection.to !== expectedPos
      ) {
        return;
      }

      instance.storage.suggestion = normalized;
      instance.storage.anchorPos = expectedPos;
      instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'refresh'));
    }).catch(() => {
      if (instance.storage.requestId !== requestId) {
        return;
      }

      if (instance.storage.suggestion) {
        instance.storage.suggestion = '';
        instance.storage.anchorPos = null;
        instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
      }
    });
  }, instance.options.debounceMs);
}

export const AIGhostTextExtension = Extension.create<AIGhostTextOptions, AIGhostTextStorage>({
  name: 'aiGhostText',

  addOptions() {
    return {
      debounceMs: 700,
      minChars: 24,
      fetchCompletion: async () => '',
    };
  },

  addStorage() {
    return {
      suggestion: '',
      requestId: 0,
      anchorPos: null,
    };
  },

  onCreate() {
    this.storage.suggestion = '';
    this.storage.requestId = 0;
    this.storage.anchorPos = null;

    const handler = (event: Event) => {
      const customEvent = event as CopilotVisibilityEvent;
      if (!customEvent.detail?.open) {
        return;
      }

      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number; anchorPos: number | null };
        editor: { state: any; view: { dispatch: (transaction: any) => void } };
      });
    };

    (this as unknown as { __copilotVisibilityHandler?: (event: Event) => void }).__copilotVisibilityHandler = handler;
    window.addEventListener('wikilive:copilot-visibility', handler);
  },

  onDestroy() {
    window.clearTimeout((this as unknown as { __aiGhostTimer?: number }).__aiGhostTimer);
    const handler = (this as unknown as { __copilotVisibilityHandler?: (event: Event) => void }).__copilotVisibilityHandler;
    if (handler) {
      window.removeEventListener('wikilive:copilot-visibility', handler);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostTextPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (transaction, oldState) => {
            if (transaction.docChanged && this.storage.suggestion) {
              this.storage.suggestion = '';
              this.storage.anchorPos = null;
            }

            if (transaction.docChanged || transaction.selectionSet || transaction.getMeta(ghostTextPluginKey)) {
              return buildDecorations(this.editor, this.storage.suggestion, this.storage.anchorPos);
            }

            return oldState.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations: (state) => ghostTextPluginKey.getState(state) ?? DecorationSet.empty,
          handleTextInput: () => {
            if (!this.storage.suggestion) {
              return false;
            }

            this.storage.suggestion = '';
            this.storage.requestId += 1;
            this.storage.anchorPos = null;
            this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
            return false;
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const suggestion = this.storage.suggestion;
        if (!suggestion || !this.editor.state.selection.empty) {
          return false;
        }

        const finalSuggestion = buildSuggestionForCursor(this.editor, suggestion);
        if (!finalSuggestion) {
          return false;
        }

        const trailingSpaces = countTrailingSpacesBeforeCursor(this.editor);
        let inserted = false;

        if (trailingSpaces > 1) {
          const cursorPos = this.editor.state.selection.to;
          const deleteFrom = cursorPos - (trailingSpaces - 1);
          inserted = this.editor
            .chain()
            .focus()
            .deleteRange({ from: deleteFrom, to: cursorPos })
            .insertContent(finalSuggestion)
            .run();
        } else {
          inserted = this.editor.commands.insertContent(finalSuggestion);
        }

        if (!inserted) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.storage.anchorPos = null;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return true;
      },
      Escape: () => {
        if (!this.storage.suggestion) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.storage.anchorPos = null;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return true;
      },
      Enter: () => {
        if (!this.storage.suggestion) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.storage.anchorPos = null;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return false;
      },
    };
  },

  onSelectionUpdate() {
    if (this.editor.state.selection.empty && this.storage.suggestion && this.storage.anchorPos !== this.editor.state.selection.to) {
      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number; anchorPos: number | null };
        editor: { state: any; view: { dispatch: (transaction: any) => void } };
      });
      return;
    }

    if (!this.editor.state.selection.empty && this.storage.suggestion) {
      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number; anchorPos: number | null };
        editor: { state: any; view: { dispatch: (transaction: any) => void } };
      });
      return;
    }

    scheduleGhostSuggestion(this as unknown as {
      storage: { suggestion: string; requestId: number; anchorPos: number | null };
      options: { minChars: number; debounceMs: number; fetchCompletion: (currentText: string) => Promise<string> };
      editor: {
        isEditable: boolean;
        state: any;
        view: { dispatch: (transaction: any) => void };
      };
      __aiGhostTimer?: number;
    });
  },

  onUpdate() {
    scheduleGhostSuggestion(this as unknown as {
      storage: { suggestion: string; requestId: number; anchorPos: number | null };
      options: { minChars: number; debounceMs: number; fetchCompletion: (currentText: string) => Promise<string> };
      editor: {
        isEditable: boolean;
        state: any;
        view: { dispatch: (transaction: any) => void };
      };
      __aiGhostTimer?: number;
    });
  },

});
