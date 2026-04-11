import { BadRequestException } from '@nestjs/common';

import type { PageTemplateDefinition, ProseMirrorNode, TemplateFieldDefinition } from './template-catalog';

type TemplateValueMap = Record<string, string | undefined>;

function normalizeValue(value: string | undefined, field: TemplateFieldDefinition): string {
  const trimmed = (value ?? field.defaultValue ?? '').trim();

  if (field.required && trimmed.length === 0) {
    throw new BadRequestException(`Поле "${field.label}" обязательно для шаблона`);
  }

  return trimmed;
}

export function buildTemplateValues(
  template: PageTemplateDefinition,
  rawValues: Record<string, string | undefined>,
): TemplateValueMap {
  return Object.fromEntries(
    template.fields.map((field) => [field.key, normalizeValue(rawValues[field.key], field)]),
  );
}

function resolveNode(node: ProseMirrorNode, values: TemplateValueMap): ProseMirrorNode | null {
  if (node.type === 'templateVariable') {
    const key = typeof node.attrs?.key === 'string' ? node.attrs.key : '';
    const value = key ? values[key] ?? '' : '';

    if (!value) {
      return null;
    }

    return {
      type: 'text',
      text: value,
    };
  }

  if (!Array.isArray(node.content)) {
    return { ...node };
  }

  const nextContent = node.content
    .map((child) => resolveNode(child, values))
    .filter((child): child is ProseMirrorNode => Boolean(child))
    .filter((child) => !(child.type === 'text' && !child.text));

  if (nextContent.length === 0 && node.type !== 'doc') {
    if (node.type === 'paragraph') {
      return {
        ...node,
        content: [],
      };
    }

    return null;
  }

  return {
    ...node,
    content: nextContent,
  };
}

export function renderTemplateDocument(
  template: PageTemplateDefinition,
  rawValues: Record<string, string | undefined>,
): ProseMirrorNode {
  const values = buildTemplateValues(template, rawValues);
  const rendered = resolveNode(template.document, values);

  if (!rendered) {
    return {
      type: 'doc',
      content: [],
    };
  }

  return rendered;
}

export function renderTemplateString(
  template: string,
  values: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key]?.trim() ?? '');
}
