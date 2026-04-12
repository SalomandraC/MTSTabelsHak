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
};

type CopilotVisibilityEvent = CustomEvent<{ open: boolean }>;

const ghostTextPluginKey = new PluginKey<DecorationSet>('aiGhostTextPlugin');

function isCopilotOpen(): boolean {
  const globalFlags = window as unknown as { __wikiliveCopilotOpen?: boolean };
  return Boolean(globalFlags.__wikiliveCopilotOpen);
}

function clearSuggestion(instance: {
  storage: { suggestion: string; requestId: number };
  editor: { state: any; view: { dispatch: (transaction: any) => void } };
}) {
  if (!instance.storage.suggestion) {
    return;
  }

  instance.storage.suggestion = '';
  instance.storage.requestId += 1;
  instance.editor.view.dispatch(instance.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
}

function buildDecorations(editor: any, suggestion: string): DecorationSet {
  if (isCopilotOpen()) {
    return DecorationSet.empty;
  }

  const state = editor.state;
  const selection = state.selection;

  if (!suggestion || !selection.empty) {
    return DecorationSet.empty;
  }

  const widget = Decoration.widget(selection.to, () => {
    const span = document.createElement('span');
    span.className = 'ai-ghost-text-hint';
    span.textContent = suggestion;
    span.title = 'Tab, чтобы принять';
    return span;
  });

  return DecorationSet.create(state.doc, [widget]);
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
    };
  },

  onCreate() {
    this.storage.suggestion = '';
    this.storage.requestId = 0;

    const handler = (event: Event) => {
      const customEvent = event as CopilotVisibilityEvent;
      if (!customEvent.detail?.open) {
        return;
      }

      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number };
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
            }

            if (transaction.docChanged || transaction.selectionSet || transaction.getMeta(ghostTextPluginKey)) {
              return buildDecorations(this.editor, this.storage.suggestion);
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

        const inserted = this.editor.commands.insertContent(suggestion);
        if (!inserted) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return true;
      },
      Escape: () => {
        if (!this.storage.suggestion) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return true;
      },
      Enter: () => {
        if (!this.storage.suggestion) {
          return false;
        }

        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        return false;
      },
    };
  },

  onSelectionUpdate() {
    if (!this.editor.state.selection.empty && this.storage.suggestion) {
      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number };
        editor: { state: any; view: { dispatch: (transaction: any) => void } };
      });
    }
  },

  onUpdate() {
    if (isCopilotOpen()) {
      clearSuggestion(this as unknown as {
        storage: { suggestion: string; requestId: number };
        editor: { state: any; view: { dispatch: (transaction: any) => void } };
      });
      return;
    }

    const selection = this.editor.state.selection;
    if (!selection.empty) {
      return;
    }

    const currentText = this.editor.state.doc.textBetween(Math.max(0, selection.to - 1200), selection.to, '\n', ' ');

    if (currentText.trim().length < this.options.minChars) {
      if (this.storage.suggestion) {
        this.storage.suggestion = '';
        this.storage.requestId += 1;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
      }
      return;
    }

    const expectedPos = selection.to;
    const requestId = this.storage.requestId + 1;
    this.storage.requestId = requestId;

    window.clearTimeout((this as unknown as { __aiGhostTimer?: number }).__aiGhostTimer);
    (this as unknown as { __aiGhostTimer?: number }).__aiGhostTimer = window.setTimeout(() => {
      void this.options.fetchCompletion(currentText).then((nextSuggestion) => {
        if (this.storage.requestId !== requestId) {
          return;
        }

        const normalized = nextSuggestion.trim();
        if (!normalized) {
          if (this.storage.suggestion) {
            this.storage.suggestion = '';
            this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
          }
          return;
        }

        if (!this.editor.isEditable || !this.editor.state.selection.empty || this.editor.state.selection.to !== expectedPos) {
          return;
        }

        this.storage.suggestion = normalized.startsWith(' ') ? normalized : ` ${normalized}`;
        this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'refresh'));
      }).catch(() => {
        if (this.storage.requestId !== requestId) {
          return;
        }

        if (this.storage.suggestion) {
          this.storage.suggestion = '';
          this.editor.view.dispatch(this.editor.state.tr.setMeta(ghostTextPluginKey, 'clear'));
        }
      });
    }, this.options.debounceMs);
  },

});
