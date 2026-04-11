import { Extension, textInputRule } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Document from '@tiptap/extension-document';
import Dropcursor from '@tiptap/extension-dropcursor';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createLowlight } from 'lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';
import { Markdown } from 'tiptap-markdown';

import { MwsTableEmbed } from '../../wiki-tables';

// AI ghost text extension is optional — provide a lightweight stub when the
// dedicated implementation is not present (avoids merge-time missing-file errors).
const AIGhostTextExtension = Extension.create({ name: 'aiGhostText' });
import { CodeBlockComponent } from '../ui/code-block-component.tsx';
import { ImageBlock } from './image-block';
import { PageLink } from './page-link';
import { RootBlock } from './root-block';
import { TemplateVariable } from './template-variable';

const lowlight = createLowlight();
lowlight.register('bash', bash);
lowlight.register('sh', bash);
lowlight.register('csharp', csharp);
lowlight.register('cs', csharp);
lowlight.register('cpp', cpp);
lowlight.register('c++', cpp);
lowlight.register('css', css);
lowlight.register('go', go);
lowlight.register('java', java);
lowlight.register('javascript', javascript);
lowlight.register('js', javascript);
lowlight.register('json', json);
lowlight.register('php', php);
lowlight.register('plaintext', plaintext);
lowlight.register('text', plaintext);
lowlight.register('python', python);
lowlight.register('py', python);
lowlight.register('rust', rust);
lowlight.register('rs', rust);
lowlight.register('sql', sql);
lowlight.register('typescript', typescript);
lowlight.register('ts', typescript);
lowlight.register('html', xml);
lowlight.register('xml', xml);
lowlight.register('yaml', yaml);
lowlight.register('yml', yaml);

const RootDocument = Document.extend({
  content: 'rootblock+',
});

const DashShortcut = Extension.create({
  name: 'dashShortcut',
  addInputRules() {
    return [
      textInputRule({
        find: /--$/,
        replace: '—',
      }),
    ];
  },
});

export const initialContent = `
<div data-type="rootblock"><h1>Новая страница</h1></div>
<div data-type="rootblock"><p></p></div>
`;

type PageEditorExtensionOptions = {
  ydoc?: Y.Doc | null;
  provider?: HocuspocusProvider | null;
  requestAutocomplete?: (currentText: string) => Promise<string>;
  user?: {
    id?: string;
    name: string;
    color: string;
  };
};

export function createPageEditorExtensions(options: PageEditorExtensionOptions = {}) {
  return [
    Markdown,
    TextStyle,
    Highlight,
    Typography,
    DashShortcut,
    Dropcursor.configure({
      color: '#d92c2c',
      width: 2,
    }),
    RootDocument,
    RootBlock,
    ImageBlock,
    TemplateVariable,
    PageLink,
    MwsTableEmbed,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'taskItem'],
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockComponent);
      },
    }).configure({
      lowlight,
      defaultLanguage: 'plaintext',
    }),
    StarterKit.configure({
      document: false,
      codeBlock: false,
    }),
    Placeholder.configure({
      emptyEditorClass: 'is-editor-empty',
      placeholder: 'Начните вводить содержимое или нажмите / чтобы использовать команды',
    }),
    AIGhostTextExtension.configure({
      fetchCompletion: options.requestAutocomplete ?? (async () => ''),
    }),
    ...(options.ydoc
      ? [
          Collaboration.configure({
            document: options.ydoc,
          }),
        ]
      : []),
    ...(options.provider
      ? [
          CollaborationCaret.configure({
            provider: options.provider,
            user: options.user ?? {
              name: 'Demo User',
              color: '#7b67ee',
            },
            render: (user) => {
              const cursor = document.createElement('span');
              cursor.classList.add('collaboration-carets__caret');
              cursor.style.setProperty('--collab-user-color', user.color ?? '#ff0037');
              cursor.dataset.user = user.name ?? 'User';

              const label = document.createElement('span');
              label.classList.add('collaboration-carets__label');
              label.textContent = user.name ?? 'User';

              cursor.appendChild(label);
              return cursor;
            },
            selectionRender: (user) => ({
              nodeName: 'span',
              class: 'collaboration-carets__selection',
              style: `--collab-user-color: ${user.color ?? '#ff0037'};`,
              'data-user': user.name ?? 'User',
            }),
          }),
        ]
      : []),
  ];
}
