import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { WikiNodeType } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { RedisService } from 'src/infra/redis/redis.service';
import {
  CreateMwsDatasheetDto,
  CreateMwsFieldDto,
  CreateMwsRecordsDto,
  CreateMwsViewDto,
  ResolveTableEmbedDto,
  UpdateMwsRecordsDto,
} from './dto/mws.dto';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type BackendSortRule = {
  fieldId: string;
  desc: boolean;
};
type NodeSourceTypeValue = 'local' | 'mws';
type NodeSyncStateValue = 'local_only' | 'synced' | 'stale';
type ExtendedWikiNodeTypeValue = WikiNodeType | 'mws_folder' | 'mws_table';

const NODE_SOURCE_LOCAL: NodeSourceTypeValue = 'local';
const NODE_SOURCE_MWS: NodeSourceTypeValue = 'mws';
const NODE_SYNC_SYNCED: NodeSyncStateValue = 'synced';
const NODE_SYNC_STALE: NodeSyncStateValue = 'stale';
const WIKI_NODE_TYPE_MWS_FOLDER: ExtendedWikiNodeTypeValue = 'mws_folder';
const WIKI_NODE_TYPE_MWS_TABLE: ExtendedWikiNodeTypeValue = 'mws_table';

export type NormalizedMwsNode = {
  id: string;
  name: string;
  type: string;
  spaceId: string | null;
  parentId: string | null;
  path: string[];
  datasheetId: string | null;
  dstId: string | null;
  openInMwsUrl: string | null;
  icon?: string | null;
  isFav?: boolean | null;
  permission?: number | null;
  capabilities?: {
    canRead?: boolean;
    canInlineEdit?: boolean;
    canCreateRecords?: boolean;
    canDeleteRecords?: boolean;
  };
  children: NormalizedMwsNode[];
};

type NormalizedMwsField = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  property?: Record<string, unknown>;
};

type NormalizedMwsRecord = {
  recordId: string;
  fields: Record<string, unknown>;
  createdAt?: number | null;
  updatedAt?: number | null;
};

@Injectable()
export class MwsService {
  private readonly baseUrl: string;
  private readonly nodeUrlTemplate: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'MWS_TABLES_BASE_URL',
      'https://tables.mws.ru/fusion/v1',
    );
    this.nodeUrlTemplate = this.configService.get<string>(
      'MWS_TABLES_NODE_URL_TEMPLATE',
      'https://tables.mws.ru/workbench/{spaceId}/{nodeId}',
    );
  }

  async listSpaces(user: UserContext) {
    return this.withCache(this.userScopedCacheKey(user, 'spaces'), 60, () =>
      this.request(user, 'GET', '/spaces').then((data) => {
        const payload = this.unwrapPayload(data);
        return {
          items: this.readArray(payload, ['spaces', 'items']).map((space: any) => ({
            id: String(space.id ?? space.spaceId ?? ''),
            name: String(space.name ?? space.title ?? space.id ?? 'Untitled space'),
            isAdmin: space.isAdmin ?? space.admin ?? null,
          })).filter((space) => Boolean(space.id)),
        };
      }),
    );
  }

  async listNodes(spaceId: string, type: string | undefined, includeChildren: boolean, user: UserContext) {
    const cacheKey = this.userScopedCacheKey(user, `nodes:${spaceId}:${type ?? 'all'}:${includeChildren ? 'tree' : 'flat'}`);
    return this.withCache(cacheKey, 30, async () => {
      const data = await this.request(
        user,
        'GET',
        `/spaces/${spaceId}/nodes`,
        undefined,
        {
          includeChildren,
          type,
        },
      );
      const payload = this.unwrapPayload(data);
      const normalizedNodes = this.ensureNodeTree(
        this.normalizeNodes(this.readArray(payload, ['nodes', 'items']), null, [], spaceId),
      );
      const nodes = includeChildren
        ? await this.hydrateFolderChildren(normalizedNodes, spaceId, user)
        : normalizedNodes;
      const filteredNodes = type && includeChildren ? this.filterNodeTreeByType(nodes, type) : nodes;

      return {
        items: includeChildren ? filteredNodes : this.flattenNodes(filteredNodes),
      };
    });
  }

  async getNode(nodeId: string, user: UserContext) {
    const data = await this.request(user, 'GET', `/nodes/${nodeId}`);
    const payload = this.unwrapPayload(data);
    return { item: this.normalizeNode(payload.item ?? payload.node ?? payload, null, []) };
  }

  async syncSpaceNodes(spaceId: string, user: UserContext) {
    const tree = await this.listNodes(spaceId, undefined, true, user);
    const flatNodes = this.flattenNodes(tree.items);
    const seenIds = new Set(flatNodes.map((node) => node.id));
    const syncedAt = new Date();

    const existingShadowNodes = await this.prisma.wikiNode.findMany({
      where: {
        spaceId,
        sourceType: NODE_SOURCE_MWS,
      },
      select: {
        id: true,
        sourceNodeId: true,
      },
    });
    const existingShadowNodeIdsBySourceId = new Map(
      existingShadowNodes
        .filter((node) => typeof node.sourceNodeId === 'string' && node.sourceNodeId.length > 0)
        .map((node) => [node.sourceNodeId as string, node.id] as const),
    );

    const localIdsBySourceId = new Map<string, string>();

    for (const node of flatNodes) {
      const existingShadowId = existingShadowNodeIdsBySourceId.get(node.id);
      const shadow = existingShadowId
        ? await this.prisma.wikiNode.update({
            where: { id: existingShadowId },
            data: {
              type: this.toShadowNodeType(node),
              sourceParentNodeId: node.parentId,
              title: node.name,
              icon: node.icon ?? null,
              isArchived: false,
              isExternalReadonly: true,
              syncState: NODE_SYNC_SYNCED,
              lastSeenInSourceAt: syncedAt,
              mwsSpaceId: node.spaceId ?? spaceId,
              mwsDatasheetId: node.datasheetId ?? node.dstId,
              updatedBy: user.userId,
            },
            select: {
              id: true,
            },
          })
        : await this.prisma.wikiNode.create({
            data: {
              spaceId,
              type: this.toShadowNodeType(node),
              sourceType: NODE_SOURCE_MWS,
              sourceNodeId: node.id,
              sourceParentNodeId: node.parentId,
              title: node.name,
              icon: node.icon ?? null,
              isArchived: false,
              isExternalReadonly: true,
              syncState: NODE_SYNC_SYNCED,
              lastSeenInSourceAt: syncedAt,
              mwsSpaceId: node.spaceId ?? spaceId,
              mwsDatasheetId: node.datasheetId ?? node.dstId,
              createdBy: user.userId,
              updatedBy: user.userId,
            },
            select: {
              id: true,
            },
          });

      localIdsBySourceId.set(node.id, shadow.id);
    }

    for (const node of flatNodes) {
      await this.prisma.wikiNode.update({
        where: {
          id: localIdsBySourceId.get(node.id),
        },
        data: {
          parentId: node.parentId ? localIdsBySourceId.get(node.parentId) ?? null : null,
        },
      });
    }

    const seenExternalIds = [...localIdsBySourceId.keys()];
    const localNodesBoundToExternalParents = await this.prisma.wikiNode.findMany({
      where: {
        spaceId,
        sourceType: NODE_SOURCE_LOCAL,
        mwsParentNodeId: {
          in: seenExternalIds,
        },
      },
      select: {
        id: true,
        mwsParentNodeId: true,
      },
    });

    for (const node of localNodesBoundToExternalParents) {
      await this.prisma.wikiNode.update({
        where: { id: node.id },
        data: {
          parentId: node.mwsParentNodeId ? localIdsBySourceId.get(node.mwsParentNodeId) ?? null : null,
        },
      });
    }

    const staleShadowIds = existingShadowNodes
      .filter((node) => node.sourceNodeId && !seenIds.has(node.sourceNodeId))
      .map((node) => node.id);

    if (staleShadowIds.length > 0) {
      await this.prisma.wikiNode.updateMany({
        where: {
          id: {
            in: staleShadowIds,
          },
        },
        data: {
          syncState: NODE_SYNC_STALE,
          updatedBy: user.userId,
        },
      });
    }

    return {
      items: flatNodes.length,
      syncedAt,
      nodes: flatNodes,
    };
  }

  async resolveShadowNode(spaceId: string, sourceNodeId: string, user: UserContext) {
    let node = await this.prisma.wikiNode.findFirst({
      where: {
        spaceId,
        sourceType: NODE_SOURCE_MWS,
        sourceNodeId,
        isArchived: false,
      },
    });

    if (!node) {
      await this.syncSpaceNodes(spaceId, user);
      node = await this.prisma.wikiNode.findFirst({
        where: {
          spaceId,
          sourceType: NODE_SOURCE_MWS,
          sourceNodeId,
          isArchived: false,
        },
      });
    }

    if (!node) {
      throw new NotFoundException('MWS folder was not found in synchronized tree');
    }

    return node;
  }

  async resolveShadowFolderNode(spaceId: string, sourceNodeId: string, user: UserContext) {
    const syncResult = await this.syncSpaceNodes(spaceId, user);
    const upstreamNode = syncResult.nodes.find((node) => node.id === sourceNodeId);

    if (!upstreamNode) {
      throw new NotFoundException('MWS folder was not found in synchronized tree');
    }

    if (!this.isFolderNode(upstreamNode)) {
      throw new BadRequestException('External parent must be an MWS folder');
    }

    const shadowNode = await this.prisma.wikiNode.findFirst({
      where: {
        spaceId,
        sourceType: NODE_SOURCE_MWS,
        sourceNodeId,
        isArchived: false,
      },
    });

    if (!shadowNode) {
      throw new NotFoundException('MWS folder shadow node was not found');
    }

    return shadowNode;
  }

  buildOpenInMwsUrlFromIds(spaceId: string | null, nodeId: string, datasheetId?: string | null) {
    if (!spaceId || !nodeId) {
      return null;
    }

    return this.nodeUrlTemplate
      .replaceAll('{spaceId}', encodeURIComponent(spaceId))
      .replaceAll('{nodeId}', encodeURIComponent(nodeId))
      .replaceAll('{datasheetId}', encodeURIComponent(String(datasheetId ?? '')));
  }

  async createDatasheet(spaceId: string, dto: CreateMwsDatasheetDto, user: UserContext) {
    const data = await this.request(user, 'POST', `/spaces/${spaceId}/datasheets`, dto);
    const payload = this.unwrapPayload(data);
    await this.invalidateNodeCache(spaceId);
    await this.syncSpaceNodes(spaceId, user);

    return {
      datasheet: {
        id: payload.id ?? payload.datasheetId ?? payload.dstId,
        name: dto.name,
        createdAt: payload.createdAt ? new Date(payload.createdAt).toISOString() : null,
        fields: payload.fields ?? [],
      },
    };
  }

  async listFields(
    datasheetId: string,
    viewId: string | undefined,
    user: UserContext,
    options?: { bypassCache?: boolean },
  ) {
    const fetchFields = async () => {
      let data: any;

      try {
        data = await this.request(user, 'GET', `/datasheets/${datasheetId}/fields`, undefined, {
          viewId,
        });
      } catch (error) {
        const errorStatus =
          error instanceof ForbiddenException ||
          error instanceof NotFoundException ||
          error instanceof BadRequestException
            ? error.getStatus()
            : null;
        const shouldRetryWithoutView =
          Boolean(viewId) &&
          (error instanceof ForbiddenException ||
            error instanceof NotFoundException ||
            error instanceof BadRequestException ||
            errorStatus === 403 ||
            errorStatus === 404 ||
            errorStatus === 400);

        if (!shouldRetryWithoutView) {
          throw error;
        }

        data = await this.request(user, 'GET', `/datasheets/${datasheetId}/fields`);
      }

      const payload = this.unwrapPayload(data);
      return {
        items: this.readArray(payload, ['fields', 'items'])
          .map((field: unknown) => this.normalizeField(field))
          .filter((field): field is NormalizedMwsField => Boolean(field.id)),
      };
    };

    if (options?.bypassCache) {
      return fetchFields();
    }

    const cacheKey = this.userScopedCacheKey(user, `fields:${datasheetId}:${viewId ?? 'default'}`);
    return this.withCache(cacheKey, 300, fetchFields);
  }

  async createField(spaceId: string, datasheetId: string, dto: CreateMwsFieldDto, user: UserContext) {
    const requestPayload = this.normalizeCreateFieldPayload(dto);
    const data = await this.request(
      user,
      'POST',
      `/spaces/${spaceId}/datasheets/${datasheetId}/fields`,
      requestPayload,
    );
    await this.invalidateDatasheetCache(datasheetId);
    return {
      field: this.normalizeField(this.unwrapPayload(data), {
        name: requestPayload.name,
        type: requestPayload.type,
        property: requestPayload.property,
      }),
    };
  }

  async deleteField(spaceId: string, datasheetId: string, fieldId: string, user: UserContext) {
    const data = await this.request(
      user,
      'DELETE',
      `/spaces/${spaceId}/datasheets/${datasheetId}/fields/${fieldId}`,
    );
    await this.invalidateDatasheetCache(datasheetId);
    return {
      deleted: Boolean(this.unwrapPayload(data) ?? true),
    };
  }

  async moveField(datasheetId: string, viewId: string, fieldId: string, index: number, user: UserContext) {
    const data = await this.request(
      user,
      'PATCH',
      `/datasheets/${datasheetId}/views/${viewId}/fields/${fieldId}`,
      { index },
    );
    await this.invalidateDatasheetCache(datasheetId);
    return {
      moved: Boolean(this.unwrapPayload(data) ?? true),
    };
  }

  async listViews(datasheetId: string, user: UserContext) {
    const cacheKey = this.userScopedCacheKey(user, `views:${datasheetId}`);
    return this.withCache(cacheKey, 300, async () => {
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/views`);
      const payload = this.unwrapPayload(data);
      return {
        items: this.readArray(payload, ['views', 'items']),
      };
    });
  }

  async createView(spaceId: string, datasheetId: string, dto: CreateMwsViewDto, user: UserContext) {
    const data = await this.request(
      user,
      'POST',
      `/spaces/${spaceId}/datasheets/${datasheetId}/views`,
      dto,
    );
    await this.invalidateDatasheetCache(datasheetId);
    return { view: this.unwrapPayload(data) };
  }

  async setViewSort(
    spaceId: string,
    datasheetId: string,
    viewId: string,
    rules: Array<{ fieldId: string; desc?: boolean }>,
    keepSort: boolean,
    applySort: boolean,
    user: UserContext,
  ) {
    const data = await this.request(
      user,
      'POST',
      `/spaces/${spaceId}/datasheets/${datasheetId}/views/${viewId}/sort`,
      {
        data: { keepSort, rules: rules.map(r => ({ fieldId: r.fieldId, desc: r.desc ?? false })) },
        applySort,
      },
    );
    await this.invalidateDatasheetCache(datasheetId);
    return { ok: true, data: this.unwrapPayload(data) };
  }

  async setViewGroup(
    spaceId: string,
    datasheetId: string,
    viewId: string,
    rules: Array<{ fieldId: string; desc?: boolean }>,
    user: UserContext,
  ) {
    const data = await this.request(
      user,
      'POST',
      `/spaces/${spaceId}/datasheets/${datasheetId}/views/${viewId}/group`,
      { data: rules.map(r => ({ fieldId: r.fieldId, desc: r.desc ?? false })) },
    );
    await this.invalidateDatasheetCache(datasheetId);
    return { ok: true, data: this.unwrapPayload(data) };
  }

  async listRecords(
    datasheetId: string,
    query: Record<string, unknown>,
    user: UserContext,
  ) {
    const cacheKey = this.userScopedCacheKey(
      user,
      `records:${datasheetId}:${Buffer.from(JSON.stringify(query)).toString('base64')}`,
    );
    return this.withCache(cacheKey, 10, async () => {
      const sortRules = this.readBackendSortRules(query.sort);
      if (sortRules.length === 0) {
        const data = await this.request(
          user,
          'GET',
          `/datasheets/${datasheetId}/records`,
          undefined,
          this.normalizeRecordsQuery(query),
        );
        return this.extractRecordList(data, query);
      }

      const requestedPageNum = this.readPositiveInt(query.pageNum, 1);
      const requestedPageSize = this.readPositiveInt(query.pageSize, 50);
      const upstreamBaseQuery = this.normalizeRecordsQuery({
        ...query,
        sort: undefined,
        pageNum: 1,
        pageSize: 1000,
      });

      const firstPageData = await this.request(
        user,
        'GET',
        `/datasheets/${datasheetId}/records`,
        undefined,
        upstreamBaseQuery,
      );
      const firstPage = this.extractRecordList(firstPageData, upstreamBaseQuery);
      const allItems = [...firstPage.items];
      const total = firstPage.total;
      const totalPages = Math.max(1, Math.ceil(total / firstPage.pageSize));

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPageData = await this.request(
          user,
          'GET',
          `/datasheets/${datasheetId}/records`,
          undefined,
          {
            ...upstreamBaseQuery,
            pageNum: page,
          },
        );
        const nextPage = this.extractRecordList(nextPageData, upstreamBaseQuery);
        allItems.push(...nextPage.items);
      }

      const sortedItems = this.sortMwsRecords(allItems, sortRules);
      const offset = (requestedPageNum - 1) * requestedPageSize;
      return {
        items: sortedItems.slice(offset, offset + requestedPageSize),
        pageNum: requestedPageNum,
        pageSize: requestedPageSize,
        total: sortedItems.length,
      };
    });
  }

  async getCellValue(datasheetId: string, recordId: string, fieldId: string, user: UserContext) {
    const records = await this.listRecords(
      datasheetId,
      {
        recordIds: recordId,
        fields: fieldId,
        pageNum: 1,
        pageSize: 1,
        fieldKey: 'id',
        cellFormat: 'json',
      },
      user,
    );

    const record = records.items.find((item: any) => String(item.recordId) === recordId) ?? records.items[0];
    if (!record) {
      throw new NotFoundException({
        code: 'MWS_RECORD_NOT_FOUND',
        message: `Record ${recordId} was not found in datasheet ${datasheetId}`,
      });
    }

    const rawValue = record.fields?.[fieldId];

    return {
      cell: {
        datasheetId,
        recordId,
        fieldId,
        value: rawValue ?? null,
        displayValue: this.stringifyCellValue(rawValue),
        updatedAt: record.updatedAt ? new Date(Number(record.updatedAt)).toISOString() : null,
      },
    };
  }

  async createRecords(datasheetId: string, dto: CreateMwsRecordsDto, user: UserContext) {
    const data = await this.request(user, 'POST', `/datasheets/${datasheetId}/records`, {
      ...dto,
      fieldKey: 'id',
    });
    await this.invalidateDatasheetCache(datasheetId);
    const payload = this.unwrapPayload(data);
    return {
      items: this.readArray(payload, ['records', 'items'])
        .map((record: unknown) => this.normalizeRecord(record))
        .filter((record): record is NormalizedMwsRecord => Boolean(record.recordId)),
    };
  }

  async updateRecords(datasheetId: string, dto: UpdateMwsRecordsDto, user: UserContext) {
    const data = await this.request(user, 'PATCH', `/datasheets/${datasheetId}/records`, {
      ...dto,
      fieldKey: 'id',
    });
    await this.invalidateDatasheetCache(datasheetId);
    const payload = this.unwrapPayload(data);
    return {
      items: this.readArray(payload, ['records', 'items'])
        .map((record: unknown) => this.normalizeRecord(record))
        .filter((record): record is NormalizedMwsRecord => Boolean(record.recordId)),
    };
  }

  async deleteRecords(datasheetId: string, recordIds: string[], user: UserContext) {
    const data = await this.request(user, 'DELETE', `/datasheets/${datasheetId}/records`, undefined, {
      recordIds: recordIds.join(','),
    });
    await this.invalidateDatasheetCache(datasheetId);
    return {
      deleted: Boolean(this.unwrapPayload(data) ?? true),
    };
  }

  async deleteDatasheet(spaceId: string, datasheetId: string, user: UserContext) {
    const data = await this.request(user, 'DELETE', `/spaces/${spaceId}/datasheet/${datasheetId}`);
    await Promise.all([
      this.invalidateNodeCache(spaceId),
      this.invalidateDatasheetCache(datasheetId),
    ]);
    await this.syncSpaceNodes(spaceId, user);

    return {
      deleted: Boolean(this.unwrapPayload(data) ?? true),
    };
  }

  async resolveTableEmbed(dto: ResolveTableEmbedDto, user: UserContext) {
    const cacheKey = this.userScopedCacheKey(user, `embed:${Buffer.from(JSON.stringify(dto)).toString('base64')}`);
    return this.withCache(cacheKey, 10, async () => {
      const [node, fields, views, preview] = await Promise.all([
        this.getNode(dto.nodeId, user),
        // Resolve should reflect external schema changes quickly (for example,
        // columns deleted directly in MWS Tables), so fields are fetched fresh.
        this.listFields(dto.datasheetId, dto.viewId, user, { bypassCache: true }),
        this.listViews(dto.datasheetId, user),
        this.listRecords(
          dto.datasheetId,
          {
            viewId: dto.viewId,
            pageSize: dto.pageSize ?? 20,
            pageNum: 1,
            fieldKey: 'id',
            cellFormat: 'json',
            filterByFormula: dto.filterByFormula,
            sort: dto.sort,
          },
          user,
        ),
      ]);

      return {
        embed: {
          node: node.item,
          datasheetId: dto.datasheetId,
          view: views.items.find((item: any) => item.id === dto.viewId) ?? views.items[0] ?? null,
          views: views.items,
          fields: this.mergeSelectedFields(fields.items, dto.selectedFieldIds),
          preview,
          total: preview.total,
          capabilities: {
            canInlineEdit: Boolean(dto.allowInlineEdit),
            canCreateRecords: true,
            canDeleteRecords: true,
            canUploadAttachments: true,
          },
          openInMwsUrl: node.item.openInMwsUrl,
        },
      };
    });
  }

  async uploadAttachment(
    datasheetId: string,
    recordId: string | undefined,
    fieldId: string | undefined,
    file: { buffer: Buffer; originalname: string },
    user: UserContext,
  ) {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname);

    const data = await this.request(
      user,
      'POST',
      `/datasheets/${datasheetId}/attachments`,
      formData,
      {
        recordId,
        fieldId,
      },
      {
        ...formData.getHeaders(),
      },
    );

    return { attachment: this.unwrapPayload(data) };
  }

  async downloadAttachment(datasheetId: string, token: string, user: UserContext) {
    const authToken = this.resolveToken(user);
    if (!authToken) {
      throw new BadRequestException({
        code: 'MWS_TOKEN_REQUIRED',
        message:
          'MWS Tables token is required. Pass x-mws-token header or set MWS_TABLES_API_TOKEN in backend/.env or docker compose environment.',
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request<ArrayBuffer>({
          method: 'GET',
          url: `${this.baseUrl}/datasheets/${datasheetId}/attachments`,
          params: { token },
          responseType: 'arraybuffer',
          headers: {
            Authorization: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
          },
        }),
      );

      const contentType = String(response.headers['content-type'] ?? 'application/octet-stream');
      const disposition = String(response.headers['content-disposition'] ?? '');
      const fileName = this.extractFileNameFromContentDisposition(disposition) ?? `attachment-${Date.now()}`;

      return {
        buffer: Buffer.from(response.data),
        contentType,
        fileName,
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message ?? 'MWS Tables attachment download failed';
      throw new BadGatewayException({
        code: 'MWS_UPSTREAM_ERROR',
        message,
        upstream: 'MWS_TABLES',
        upstreamStatus: status ?? 502,
      });
    }
  }

  private async withCache<T>(key: string, ttlSec: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.redisService.getJson<T>(key);
    if (cached) {
      return cached;
    }

    const fresh = await factory();
    await this.redisService.setJson(key, fresh, ttlSec);
    return fresh;
  }

  private flattenNodes(nodes: NormalizedMwsNode[]): NormalizedMwsNode[] {
    const result: NormalizedMwsNode[] = [];
    const visit = (node: NormalizedMwsNode) => {
      result.push({ ...node, children: [] });
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };
    nodes.forEach(visit);
    return result;
  }

  private filterNodeTreeByType(nodes: NormalizedMwsNode[], type: string): NormalizedMwsNode[] {
    const normalizedType = type.toLowerCase();

    return nodes
      .map((node) => {
        const children = this.filterNodeTreeByType(node.children, type);
        const matches = node.type.toLowerCase() === normalizedType;

        return matches || children.length > 0 ? { ...node, children } : null;
      })
      .filter((node): node is NormalizedMwsNode => Boolean(node));
  }

  private async hydrateFolderChildren(
    nodes: NormalizedMwsNode[],
    spaceId: string,
    user: UserContext,
    visited = new Set<string>(),
  ): Promise<NormalizedMwsNode[]> {
    return Promise.all(
      nodes.map(async (node) => {
        if (visited.has(node.id)) {
          return node;
        }

        visited.add(node.id);

        const explicitChildren = node.children.length > 0
          ? node.children
          : this.isFolderNode(node)
            ? await this.fetchNodeChildren(node, spaceId, user)
            : [];

        return {
          ...node,
          children: await this.hydrateFolderChildren(explicitChildren, spaceId, user, visited),
        };
      }),
    );
  }

  private async fetchNodeChildren(
    node: NormalizedMwsNode,
    spaceId: string,
    user: UserContext,
  ): Promise<NormalizedMwsNode[]> {
    const data = await this.request(user, 'GET', `/nodes/${node.id}`);
    const payload = this.unwrapPayload(data);
    const detail = payload.item ?? payload.node ?? payload;

    return this.normalizeNodes(
      this.readNodeChildren(detail),
      node.id,
      node.path,
      node.spaceId ?? spaceId,
    );
  }

  private isFolderNode(node: NormalizedMwsNode) {
    return node.type.toLowerCase().includes('folder');
  }

  private toShadowNodeType(node: NormalizedMwsNode): ExtendedWikiNodeTypeValue {
    return this.isTableNode(node) ? WIKI_NODE_TYPE_MWS_TABLE : WIKI_NODE_TYPE_MWS_FOLDER;
  }

  private isTableNode(node: NormalizedMwsNode) {
    const normalizedType = node.type.toLowerCase();
    return Boolean(node.datasheetId ?? node.dstId) || normalizedType.includes('datasheet') || normalizedType.includes('table');
  }

  private normalizeNodes(
    nodes: any[],
    parentId: string | null = null,
    parentPath: string[] = [],
    spaceId?: string | null,
  ) {
    return nodes
      .map((node) => this.normalizeNode(node, parentId, parentPath, spaceId))
      .filter((node): node is NormalizedMwsNode => Boolean(node.id));
  }

  private normalizeNode(
    node: any,
    parentId: string | null,
    parentPath: string[],
    spaceId?: string | null,
  ): NormalizedMwsNode {
    const id = String(node?.id ?? node?.nodeId ?? node?.uuid ?? '');
    const name = String(node?.name ?? node?.title ?? node?.label ?? id);
    const type = String(node?.type ?? node?.nodeType ?? node?.kind ?? 'unknown');
    const nodeSpaceId = node?.spaceId ?? node?.space?.id ?? spaceId ?? null;
    const normalizedSpaceId = nodeSpaceId ? String(nodeSpaceId) : null;
    const path = [...parentPath, name].filter(Boolean);
    const datasheetId = node?.datasheetId ?? node?.dstId ?? node?.datasheet?.id ?? null;
    const children = this.readNodeChildren(node);

    return {
      id,
      name,
      type,
      spaceId: normalizedSpaceId,
      parentId: node?.parentId ?? parentId,
      path,
      datasheetId: datasheetId ? String(datasheetId) : null,
      dstId: node?.dstId ? String(node.dstId) : datasheetId ? String(datasheetId) : null,
      openInMwsUrl: this.buildOpenInMwsUrl(node, normalizedSpaceId, id, datasheetId),
      icon: node?.icon ?? null,
      isFav: node?.isFav ?? node?.favorite ?? null,
      permission: node?.permission ?? null,
      capabilities: {
        canRead: node?.capabilities?.canRead ?? true,
        canInlineEdit: node?.capabilities?.canInlineEdit ?? this.canEditByPermission(node?.permission),
        canCreateRecords: node?.capabilities?.canCreateRecords ?? this.canEditByPermission(node?.permission),
        canDeleteRecords: node?.capabilities?.canDeleteRecords ?? this.canEditByPermission(node?.permission),
      },
      children: this.normalizeNodes(children, id || parentId, path, normalizedSpaceId),
    };
  }

  private buildOpenInMwsUrl(
    node: any,
    spaceId: string | null,
    nodeId: string,
    datasheetId?: unknown,
  ) {
    const upstreamUrl =
      node?.openInMwsUrl ??
      node?.url ??
      node?.webUrl ??
      node?.shareUrl ??
      node?.links?.web ??
      node?.links?.self;

    if (typeof upstreamUrl === 'string' && upstreamUrl.trim()) {
      return upstreamUrl;
    }

    if (!spaceId || !nodeId) {
      return null;
    }

    return this.nodeUrlTemplate
      .replaceAll('{spaceId}', encodeURIComponent(spaceId))
      .replaceAll('{nodeId}', encodeURIComponent(nodeId))
      .replaceAll('{datasheetId}', encodeURIComponent(String(datasheetId ?? '')));
  }

  private readNodeChildren(node: any): any[] {
    if (Array.isArray(node?.children)) {
      return node.children;
    }

    if (Array.isArray(node?.childNodes)) {
      return node.childNodes;
    }

    if (Array.isArray(node?.nodes)) {
      return node.nodes;
    }

    if (Array.isArray(node?.items)) {
      return node.items;
    }

    return [];
  }

  private ensureNodeTree(nodes: NormalizedMwsNode[]): NormalizedMwsNode[] {
    const flattened: NormalizedMwsNode[] = this.flattenNodes(nodes).map((node) => ({
      ...node,
      children: [],
    }));
    const byId = new Map(flattened.map((node) => [node.id, node]));
    const roots: NormalizedMwsNode[] = [];

    for (const node of flattened) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)?.children.push(node);
        continue;
      }

      roots.push(node);
    }

    return this.rebuildNodePaths(roots, []);
  }

  private rebuildNodePaths(nodes: NormalizedMwsNode[], parentPath: string[]): NormalizedMwsNode[] {
    return nodes.map((node) => {
      const path = [...parentPath, node.name].filter(Boolean);

      return {
        ...node,
        path,
        children: this.rebuildNodePaths(node.children, path),
      };
    });
  }

  private canEditByPermission(permission: unknown) {
    if (typeof permission !== 'number') {
      return undefined;
    }

    return permission > 1;
  }

  private unwrapPayload(data: any) {
    return data?.data ?? data;
  }

  private readArray(payload: any, keys: string[]) {
    const direct = this.readNestedValue(payload, keys);
    if (Array.isArray(direct)) {
      return direct;
    }

    for (const key of keys) {
      if (Array.isArray(payload?.[key])) {
        return payload[key];
      }
    }

    return Array.isArray(payload) ? payload : [];
  }

  private readNestedValue(payload: any, keys: string[]) {
    let current = payload;

    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return undefined;
      }

      current = current[key];
    }

    return current;
  }

  private normalizeRecordsQuery(query: Record<string, unknown>) {
    const sort = query.sort;
    if (!sort) {
      return query;
    }

    if (Array.isArray(sort) && sort.length === 0) {
      return {
        ...query,
        sort: undefined,
      };
    }

    if (typeof sort === 'string') {
      if (!sort.trim() || sort.trim() === '[]') {
        return {
          ...query,
          sort: undefined,
        };
      }

      return query;
    }

    try {
      return {
        ...query,
        sort: JSON.stringify(sort),
      };
    } catch {
      return {
        ...query,
        sort: undefined,
      };
    }
  }

  private extractRecordList(data: any, query: Record<string, unknown>) {
    const payload = this.unwrapPayload(data);
    const nestedRecords = this.readNestedValue(payload, ['records']);
    return {
      items: this.readArray(payload, ['records', 'items'])
        .map((record: unknown) => this.normalizeRecord(record))
        .filter((record): record is NormalizedMwsRecord => Boolean(record.recordId)),
      pageNum: Number(payload.pageNum ?? nestedRecords?.pageNum ?? query.pageNum ?? 1),
      pageSize: Number(payload.pageSize ?? nestedRecords?.pageSize ?? query.pageSize ?? 50),
      total: Number(payload.total ?? nestedRecords?.total ?? 0),
    };
  }

  private normalizeField(
    value: unknown,
    fallback?: { name?: string; type?: string; property?: Record<string, unknown> },
  ): NormalizedMwsField {
    const field = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const id = this.readString(field.id ?? field.fieldId);
    const name =
      this.readString(field.name ?? field.title ?? field.label) ??
      fallback?.name ??
      id ??
      '';
    const type =
      this.readString(field.type ?? field.fieldType) ??
      fallback?.type ??
      'SingleText';
    const property = this.readObject(field.property) ?? fallback?.property;
    const description = this.readString(field.description) ?? null;

    return {
      id: id ?? '',
      name,
      type,
      description,
      property,
    };
  }

  private normalizeRecord(value: unknown): NormalizedMwsRecord {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const fields = this.readObject(record.fields) ?? {};

    return {
      recordId: this.readString(record.recordId ?? record.id) ?? '',
      fields,
      createdAt: this.readNullableNumber(record.createdAt),
      updatedAt: this.readNullableNumber(record.updatedAt),
    };
  }

  private mergeSelectedFields(fields: NormalizedMwsField[], selectedFieldIds?: string[]) {
    if (!Array.isArray(selectedFieldIds) || selectedFieldIds.length === 0) {
      return fields;
    }

    const fieldMap = new Map(fields.map((field) => [field.id, field] as const));
    const selected = selectedFieldIds
      .map((fieldId) => fieldMap.get(fieldId))
      .filter((field): field is NormalizedMwsField => Boolean(field));
    const selectedIdSet = new Set(selected.map((field) => field.id));
    const extras = fields.filter((field) => !selectedIdSet.has(field.id));

    return [...selected, ...extras];
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private readObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readNullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readBackendSortRules(rawSort: unknown): BackendSortRule[] {
    const normalized = this.parseJsonIfNeeded(rawSort);
    if (!Array.isArray(normalized)) {
      return [];
    }

    return normalized
      .map((rule) => {
        if (!rule || typeof rule !== 'object') {
          return null;
        }

        const fieldId = (rule as { fieldId?: unknown }).fieldId;
        if (typeof fieldId !== 'string' || !fieldId.trim()) {
          return null;
        }

        return {
          fieldId,
          desc: Boolean((rule as { desc?: unknown }).desc),
        };
      })
      .filter((rule): rule is BackendSortRule => Boolean(rule));
  }

  private parseJsonIfNeeded(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    if (!value.trim()) {
      return undefined;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private normalizeCreateFieldPayload(dto: CreateMwsFieldDto): CreateMwsFieldDto {
    const normalizedName = dto.name.trim();
    const normalizedType = dto.type;
    const property = this.readObject(dto.property);

    const emptyProperty = !property || Object.keys(property).length === 0;
    const propertyShouldBeOptional = new Set([
      'Text',
      'Attachment',
      'URL',
      'Phone',
      'Email',
      'WorkDoc',
      'AutoNumber',
      'CreatedTime',
      'LastModifiedTime',
      'CreatedBy',
      'LastModifiedBy',
    ]);

    if (normalizedType === 'Checkbox') {
      const icon =
        property && typeof property.icon === 'string' ? property.icon.trim() : '';

      return {
        name: normalizedName,
        type: normalizedType,
        property: { ...property, icon: icon || 'check' },
      };
    }

    if (propertyShouldBeOptional.has(normalizedType) && emptyProperty) {
      return {
        name: normalizedName,
        type: normalizedType,
      };
    }

    return {
      name: normalizedName,
      type: normalizedType,
      ...(property ? { property } : {}),
    };
  }

  private readPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private sortMwsRecords(records: any[], sortRules: BackendSortRule[]) {
    if (sortRules.length === 0) {
      return records;
    }

    return [...records].sort((left, right) => {
      for (const rule of sortRules) {
        const leftValue = this.normalizeRecordSortValue(left?.fields?.[rule.fieldId]);
        const rightValue = this.normalizeRecordSortValue(right?.fields?.[rule.fieldId]);
        const result = this.compareRecordSortValues(leftValue, rightValue);
        if (result !== 0) {
          return rule.desc ? -result : result;
        }
      }

      return 0;
    });
  }

  private normalizeRecordSortValue(value: unknown): string | number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const rendered = this.stringifyCellValue(value).trim();
    if (!rendered) {
      return null;
    }

    if (/^-?\d+(\.\d+)?$/.test(rendered)) {
      const numeric = Number(rendered);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    return rendered.toLowerCase();
  }

  private compareRecordSortValues(left: string | number | null, right: string | number | null) {
    if (left === right) {
      return 0;
    }

    if (left === null) {
      return 1;
    }

    if (right === null) {
      return -1;
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }

    return String(left).localeCompare(String(right), 'ru', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  private stringifyCellValue(value: unknown): string {
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
        .map((item) => this.stringifyCellValue(item))
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

  private async invalidateNodeCache(spaceId: string) {
    await this.redisService.delByPattern(`mws:user:*:nodes:${spaceId}:*`);
  }

  private async invalidateDatasheetCache(datasheetId: string) {
    await Promise.all([
      this.redisService.delByPattern(`mws:user:*:records:${datasheetId}:*`),
      this.redisService.delByPattern('mws:user:*:embed:*'),
      this.redisService.delByPattern(`mws:user:*:fields:${datasheetId}:*`),
      this.redisService.delByPattern(`mws:user:*:views:${datasheetId}`),
    ]);
  }

  private userScopedCacheKey(user: UserContext, key: string) {
    return `mws:user:${user.userId}:${key}`;
  }


  private async request(
    user: UserContext,
    method: HttpMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ) {
    const token = this.resolveToken(user);
    if (!token) {
      throw new BadRequestException({
        code: 'MWS_TOKEN_REQUIRED',
        message:
          'MWS Tables token is required. Pass x-mws-token header or set MWS_TABLES_API_TOKEN in backend/.env or docker compose environment.',
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url: `${this.baseUrl}${path}`,
          data,
          params,
          headers: {
            Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            ...extraHeaders,
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message ?? 'MWS Tables request failed';
      const payload = {
        code: 'MWS_UPSTREAM_ERROR',
        message,
        upstream: 'MWS_TABLES',
        upstreamStatus: status ?? 502,
      };

      if (status === 403) {
        throw new ForbiddenException(payload);
      }

      if (status === 404) {
        throw new NotFoundException(payload);
      }

      if (status === 401) {
        throw new UnauthorizedException(payload);
      }

      throw new BadGatewayException(payload);
    }
  }

  private resolveToken(user: UserContext): string | undefined {
    const candidates = [
      user.mwsToken,
      user.authToken,
      this.configService.get<string>('MWS_TABLES_API_TOKEN'),
      process.env.MWS_TABLES_API_TOKEN,
    ];

    return candidates
      .map((candidate) => candidate?.replace(/^Bearer\s+/i, '').trim())
      .find((candidate) => Boolean(candidate));
  }

  private extractFileNameFromContentDisposition(value: string): string | null {
    if (!value) {
      return null;
    }

    const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) {
      try {
        return decodeURIComponent(utfMatch[1]);
      } catch {
        return utfMatch[1];
      }
    }

    const asciiMatch = value.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] ?? null;
  }
}
