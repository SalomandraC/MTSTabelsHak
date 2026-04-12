import { BadRequestException, Injectable } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { MwsService } from 'src/mws/mws.service';
import { PagesService } from 'src/pages/pages.service';
import { AI_TOOL_DEFINITIONS, AI_TOOL_SCHEMA_BY_NAME } from './tool-definitions';
import { validateToolArguments } from './tool-schema-validator';
import {
  CanonicalMwsRecord,
  SmartImportCandidate,
  ToolExecutionContext,
  ToolExecutionFailure,
  ToolExecutionResult,
  ToolExecutionSuccess,
} from './ai-tool-registry.types';
import { WikiDocumentInjectionService } from './wiki-document-injection.service';

@Injectable()
export class AiToolRegistryService {
  constructor(
    private readonly mwsService: MwsService,
    private readonly pagesService: PagesService,
    private readonly wikiDocumentInjectionService: WikiDocumentInjectionService,
  ) {}

  getToolDefinitions() {
    return AI_TOOL_DEFINITIONS;
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext = {},
  ): Promise<ToolExecutionResult> {
    const schema = AI_TOOL_SCHEMA_BY_NAME[toolName];
    if (!schema) {
      throw new BadRequestException({
        code: 'AI_TOOL_UNKNOWN',
        message: `Unknown tool: ${toolName}`,
      });
    }

    validateToolArguments(schema, args);

    try {
      switch (toolName) {
        case 'create_records':
          return await this.createRecords(args, user, context);
        case 'patch_records':
          return await this.patchRecords(args, user, context);
        case 'get_records':
          return await this.getRecords(args, user, context);
        case 'delete_records':
          return await this.deleteRecords(args, user, context);
        case 'analyze_table_data':
          return await this.analyzeTableData(args, user, context);
        case 'create_wiki_page':
          return await this.createWikiPage(args, user, context);
        case 'add_table_column':
          return await this.addTableColumn(args, user, context);
        case 'smart_import':
          return await this.smartImport(args, user, context);
        default:
          throw new BadRequestException({
            code: 'AI_TOOL_UNKNOWN',
            message: `Unknown tool: ${toolName}`,
          });
      }
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      return {
        ok: false,
        toolName,
        error: {
          code:
            error?.response?.data?.code ??
            error?.response?.data?.error?.code ??
            error?.code ??
            'AI_TOOL_EXECUTION_FAILED',
          message: error?.response?.data?.message ?? error?.message ?? 'Tool execution failed',
          status,
          details: error?.response?.data ?? error?.details,
        },
      } satisfies ToolExecutionFailure;
    }
  }

  private async createRecords(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const result = await this.mwsService.createRecords(String(args.datasheetId), {
      fieldKey: 'id',
      records: this.coerceRecords(args.records),
    } as any, user);

    return this.success('create_records', result, context.pageId);
  }

  private async patchRecords(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const result = await this.mwsService.updateRecords(String(args.datasheetId), {
      fieldKey: 'id',
      records: this.coerceUpdateRecords(args.records),
    } as any, user);

    return this.success('patch_records', result, context.pageId);
  }

  private async getRecords(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const result = await this.mwsService.listRecords(
      String(args.datasheetId),
      {
        viewId: typeof args.viewId === 'string' ? args.viewId : undefined,
        pageSize: typeof args.pageSize === 'number' ? args.pageSize : 20,
        pageNum: typeof args.pageNum === 'number' ? args.pageNum : 1,
        fields: Array.isArray(args.fields) ? args.fields.join(',') : undefined,
        filterByFormula: typeof args.filterByFormula === 'string' ? args.filterByFormula : undefined,
        fieldKey: 'id',
        cellFormat: typeof args.cellFormat === 'string' ? args.cellFormat : 'json',
      },
      user,
    );

    return this.success('get_records', result, context.pageId);
  }

  private async deleteRecords(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const recordIds = Array.isArray(args.recordIds) ? args.recordIds.map((value) => String(value)) : [];
    const result = await this.mwsService.deleteRecords(String(args.datasheetId), recordIds, user);

    return this.success('delete_records', result, context.pageId);
  }

  private async smartImport(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const contextText = String(args.contextText ?? '');
    const hints = (args.hints as Record<string, unknown> | undefined) ?? {};
    const maxCandidates = Number(hints.maxCandidates ?? 3);

    const candidates = await this.findCandidates(contextText, hints, user, maxCandidates);
    const recommendedCandidate = candidates[0] ?? null;

    const editorCommand = recommendedCandidate
      ? this.wikiDocumentInjectionService.buildInsertEmbedCommand(
          recommendedCandidate,
          context.pageId ?? String(args.pageId ?? ''),
        )
      : undefined;

    const data = {
      candidates,
      recommendedAction: recommendedCandidate
        ? {
            op: 'insert_embed',
            position: 'after_selection',
            candidate: recommendedCandidate,
          }
        : {
            op: 'no_op',
            reason: 'No MWS table candidates matched the page context',
          },
    };

    return {
      ok: true,
      toolName: 'smart_import',
      data,
      editorCommand,
    } satisfies ToolExecutionSuccess;
  }

  private async analyzeTableData(
    args: Record<string, unknown>,
    user: UserContext,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const result = await this.mwsService.listRecords(
      String(args.datasheetId),
      {
        viewId: typeof args.viewId === 'string' ? args.viewId : undefined,
        pageSize: typeof args.pageSize === 'number' ? args.pageSize : 100,
        pageNum: typeof args.pageNum === 'number' ? args.pageNum : 1,
        fields: Array.isArray(args.fields) ? args.fields.join(',') : undefined,
        fieldKey: 'id',
        cellFormat: 'json',
      },
      user,
    );

    const markdown = this.buildTableAnalysisMarkdown(result.items ?? []);

    return {
      ok: true,
      toolName: 'analyze_table_data',
      data: {
        datasheetId: String(args.datasheetId),
        viewId: typeof args.viewId === 'string' ? args.viewId : null,
        markdown,
        total: result.total,
        pageNum: result.pageNum,
        pageSize: result.pageSize,
      },
    };
  }

  private async createWikiPage(
    args: Record<string, unknown>,
    user: UserContext,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const created = await this.pagesService.createPage(
      {
        spaceId: String(args.spaceId),
        title: String(args.title),
        parentNodeId: typeof args.parentNodeId === 'string' ? args.parentNodeId : undefined,
        icon: typeof args.icon === 'string' ? args.icon : 'doc',
      },
      user,
    );

    return {
      ok: true,
      toolName: 'create_wiki_page',
      data: {
        page: created.page,
      },
    };
  }

  private async addTableColumn(
    args: Record<string, unknown>,
    user: UserContext,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionSuccess> {
    const result = await this.mwsService.createField(
      String(args.spaceId),
      String(args.datasheetId),
      {
        name: String(args.name),
        type: String(args.type),
        property: isPlainObject(args.property) ? args.property : undefined,
      } as any,
      user,
    );

    return {
      ok: true,
      toolName: 'add_table_column',
      data: {
        datasheetId: String(args.datasheetId),
        field: result.field,
      },
    };
  }

  private async findCandidates(
    contextText: string,
    hints: Record<string, unknown>,
    user: UserContext,
    maxCandidates: number,
  ): Promise<SmartImportCandidate[]> {
    const spaces = await this.mwsService.listSpaces(user);
    const keywords = this.extractKeywords(contextText);
    const preferredSpaceId = typeof hints.spaceId === 'string' ? hints.spaceId : undefined;
    const candidates: SmartImportCandidate[] = [];

    for (const space of spaces.items ?? []) {
      if (preferredSpaceId && String(space.id ?? '') !== preferredSpaceId) {
        continue;
      }

      const nodesResponse = await this.mwsService.listNodes(String(space.id), undefined, true, user);
      for (const node of nodesResponse.items ?? []) {
        const nodeCandidate = this.buildCandidateFromNode(String(space.id), node, keywords);
        if (nodeCandidate) {
          candidates.push(nodeCandidate);
        }
      }
    }

    return candidates.sort((left, right) => right.score - left.score).slice(0, maxCandidates);
  }

  private buildCandidateFromNode(spaceId: string, node: Record<string, any>, keywords: string[]): SmartImportCandidate | null {
    const nodeId = String(node.id ?? node.nodeId ?? '');
    const datasheetId = String(
      node.datasheetId ?? node.mwsDatasheetId ?? node.tableId ?? node.targetId ?? node.datasetId ?? '',
    );

    if (!nodeId || !datasheetId) {
      return null;
    }

    const title = String(node.name ?? node.title ?? node.label ?? '');
    const type = String(node.type ?? node.kind ?? '');
    const searchable = `${title} ${type} ${String(node.description ?? '')}`.toLowerCase();

    const matchedKeywords = keywords.filter((keyword) => searchable.includes(keyword));
    const score = matchedKeywords.length === 0 ? 0 : Math.min(1, matchedKeywords.length / Math.max(1, keywords.length));

    if (score === 0 && !this.looksLikeTableNode(node)) {
      return null;
    }

    return {
      score,
      spaceId,
      nodeId,
      datasheetId,
      viewId: this.pickViewId(node),
      selectedFieldIds: Array.isArray(node.selectedFieldIds)
        ? node.selectedFieldIds.map((value: unknown) => String(value))
        : [],
      reason: matchedKeywords.length
        ? `Matched keywords: ${matchedKeywords.join(', ')}`
        : 'Node looks like a table or datasheet candidate',
    };
  }

  private looksLikeTableNode(node: Record<string, any>): boolean {
    const type = String(node.type ?? node.kind ?? '').toLowerCase();
    return ['datasheet', 'table', 'sheet', 'grid'].some((item) => type.includes(item)) || Boolean(node.datasheetId ?? node.mwsDatasheetId);
  }

  private pickViewId(node: Record<string, any>): string | null {
    return String(node.viewId ?? node.defaultViewId ?? node.mwsViewId ?? '') || null;
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .filter((item, index, values) => values.indexOf(item) === index)
      .slice(0, 24);
  }

  private coerceRecords(value: unknown): Array<{ fields: Record<string, unknown> }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => ({
      fields: isPlainObject((item as Record<string, unknown>).fields)
        ? ((item as Record<string, unknown>).fields as Record<string, unknown>)
        : {},
    }));
  }

  private coerceUpdateRecords(value: unknown): Array<{ recordId: string; fields: Record<string, unknown> }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        recordId: String(record.recordId ?? ''),
        fields: isPlainObject(record.fields) ? (record.fields as Record<string, unknown>) : {},
      };
    });
  }

  private success(
    toolName: string,
    data: Record<string, unknown> & {
      items?: unknown;
      records?: unknown;
      datasheetId?: unknown;
      viewId?: unknown;
      embed?: { datasheetId?: unknown; viewId?: unknown };
    },
    pageId?: string,
  ): ToolExecutionSuccess {
    const canonicalRecords = this.toCanonicalRecords(data.items ?? data.records ?? []);
    const datasheetId =
      typeof data.datasheetId === 'string'
        ? data.datasheetId
        : typeof data.embed?.datasheetId === 'string'
          ? data.embed.datasheetId
          : '';
    const viewId =
      typeof data.viewId === 'string'
        ? data.viewId
        : typeof data.embed?.viewId === 'string'
          ? data.embed.viewId
          : undefined;
    const editorCommand =
      pageId && canonicalRecords.length > 0
        ? this.wikiDocumentInjectionService.buildRefreshEmbedCommand(pageId, datasheetId, viewId)
        : undefined;

    return {
      ok: true,
      toolName,
      data,
      canonicalRecords: canonicalRecords.length > 0 ? canonicalRecords : undefined,
      editorCommand,
    };
  }

  private toCanonicalRecords(items: unknown): CanonicalMwsRecord[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        recordId: String(record.recordId ?? record.id ?? ''),
        fields: isPlainObject(record.fields) ? (record.fields as Record<string, unknown>) : {},
        createdAt: record.createdAt ? String(record.createdAt) : null,
        updatedAt: record.updatedAt ? String(record.updatedAt) : null,
      };
    });
  }

  private buildTableAnalysisMarkdown(items: unknown[]): string {
    const rows = Array.isArray(items) ? items : [];
    const numericStats = new Map<string, { count: number; sum: number; min: number; max: number }>();
    const nonEmptyByField = new Map<string, number>();

    for (const item of rows) {
      const record = item as Record<string, unknown>;
      const fields = isPlainObject(record.fields) ? (record.fields as Record<string, unknown>) : {};

      Object.entries(fields).forEach(([fieldId, value]) => {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          nonEmptyByField.set(fieldId, (nonEmptyByField.get(fieldId) ?? 0) + 1);
        }

        const numericValue = this.toNumber(value);
        if (numericValue === null) {
          return;
        }

        const current = numericStats.get(fieldId);
        if (!current) {
          numericStats.set(fieldId, {
            count: 1,
            sum: numericValue,
            min: numericValue,
            max: numericValue,
          });
          return;
        }

        current.count += 1;
        current.sum += numericValue;
        current.min = Math.min(current.min, numericValue);
        current.max = Math.max(current.max, numericValue);
      });
    }

    const topNonEmpty = [...nonEmptyByField.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topNumeric = [...numericStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const lines: string[] = [];
    lines.push('## Анализ таблицы');
    lines.push('');
    lines.push(`- Строк проанализировано: ${rows.length}`);

    if (topNonEmpty.length > 0) {
      lines.push('- Наиболее заполненные поля:');
      topNonEmpty.forEach(([fieldId, count]) => {
        lines.push(`  - ${fieldId}: ${count} заполненных значений`);
      });
    }

    if (topNumeric.length > 0) {
      lines.push('- Числовые тренды и диапазоны:');
      topNumeric.forEach(([fieldId, stat]) => {
        const avg = stat.sum / Math.max(1, stat.count);
        lines.push(`  - ${fieldId}: avg=${avg.toFixed(2)}, min=${stat.min.toFixed(2)}, max=${stat.max.toFixed(2)}, n=${stat.count}`);
      });
    }

    if (topNumeric.length === 0 && topNonEmpty.length === 0) {
      lines.push('- Недостаточно структурированных данных для вывода трендов.');
    }

    return lines.join('\n');
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.replace(/\s+/g, '').replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}