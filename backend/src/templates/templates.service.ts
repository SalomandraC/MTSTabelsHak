import { Injectable, NotFoundException } from '@nestjs/common';
import { Schema } from 'prosemirror-model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

import { UserContext } from 'src/auth/user-context';
import { PagesService } from 'src/pages/pages.service';
import type { CreatePageDto } from 'src/pages/dto/create-page.dto';
import { templateCatalog } from './template-catalog';
import { renderTemplateDocument, renderTemplateString, buildTemplateValues } from './template-renderer';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';

const templateInstantiationSchema = new Schema({
  nodes: {
    doc: {
      content: 'rootblock+',
    },
    rootblock: {
      group: 'rootblock',
      content: 'block',
      toDOM: () => ['div', { 'data-type': 'rootblock' }, 0],
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: {
        level: { default: 1 },
      },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ol', 0],
    },
    listItem: {
      group: 'block',
      content: 'paragraph+',
      toDOM: () => ['li', 0],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
    },
    text: {
      group: 'inline',
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
      toDOM: () => ['br'],
    },
  },
});

@Injectable()
export class TemplatesService {
  constructor(private readonly pagesService: PagesService) {}

  listTemplates() {
    return {
      items: templateCatalog.map((template) => ({
        id: template.id,
        title: template.title,
        summary: template.summary,
        category: template.category,
        audience: template.audience,
        icon: template.icon,
        fields: template.fields,
      })),
    };
  }

  async instantiateTemplate(templateId: string, dto: InstantiateTemplateDto, user: UserContext) {
    const template = templateCatalog.find((item) => item.id === templateId);

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    const values = buildTemplateValues(template, dto.values ?? {});
    const resolvedTitle = (dto.title?.trim() || renderTemplateString(template.pageTitleTemplate, values)).trim();
    const document = this.wrapInRootBlocks(renderTemplateDocument(template, values));
    const ydoc = prosemirrorJSONToYDoc(templateInstantiationSchema, document, 'default');
    const initialContent = this.toInitialContent(ydoc);

    const payload: CreatePageDto = {
      spaceId: dto.spaceId,
      parentNodeId: dto.parentNodeId,
      title: resolvedTitle || template.title,
      icon: 'doc',
      initialContent,
    };

    return this.pagesService.createPage(payload, user);
  }

  private toInitialContent(ydoc: Y.Doc) {
    return {
      encoding: 'base64-yjs-update-v2',
      value: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'),
    };
  }

  private wrapInRootBlocks(document: Record<string, any>) {
    const content = Array.isArray(document?.content) ? document.content : [];
    const wrapped = content
      .filter((node) => node && typeof node === 'object')
      .map((node) => {
        if (node.type === 'rootblock') {
          return node;
        }

        return {
          type: 'rootblock',
          content: [node],
        };
      });

    return {
      type: 'doc',
      content: wrapped.length > 0
        ? wrapped
        : [{ type: 'rootblock', content: [{ type: 'paragraph', content: [] }] }],
    };
  }
}
