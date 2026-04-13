import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { UserContext } from 'src/auth/user-context';
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

@Injectable()
export class MwsService {
  private readonly baseUrl: string;
  private readonly nodeUrlTemplate: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
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

  async createDatasheet(spaceId: string, dto: CreateMwsDatasheetDto, user: UserContext) {
    const data = await this.request(user, 'POST', `/spaces/${spaceId}/datasheets`, dto);
    const payload = this.unwrapPayload(data);
    await this.invalidateNodeCache(spaceId);

    return {
      datasheet: {
        id: payload.id ?? payload.datasheetId ?? payload.dstId,
        name: dto.name,
        createdAt: payload.createdAt ? new Date(payload.createdAt).toISOString() : null,
        fields: payload.fields ?? [],
      },
    };
  }

  async listFields(datasheetId: string, viewId: string | undefined, user: UserContext) {
    const cacheKey = this.userScopedCacheKey(user, `fields:${datasheetId}:${viewId ?? 'default'}`);
    return this.withCache(cacheKey, 300, async () => {
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/fields`, undefined, {
        viewId,
      });
      const payload = this.unwrapPayload(data);
      return {
        items: this.readArray(payload, ['fields', 'items']),
      };
    });
  }

  async createField(spaceId: string, datasheetId: string, dto: CreateMwsFieldDto, user: UserContext) {
    const data = await this.request(
      user,
      'POST',
      `/spaces/${spaceId}/datasheets/${datasheetId}/fields`,
      dto,
    );
    await this.invalidateDatasheetCache(datasheetId);
    return { field: this.unwrapPayload(data) };
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
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/records`, undefined, this.normalizeRecordsQuery(query));
      const payload = this.unwrapPayload(data);
      const nestedRecords = this.readNestedValue(payload, ['records']);
      return {
        items: this.readArray(payload, ['records', 'items']),
        pageNum: Number(payload.pageNum ?? nestedRecords?.pageNum ?? query.pageNum ?? 1),
        pageSize: Number(payload.pageSize ?? nestedRecords?.pageSize ?? query.pageSize ?? 50),
        total: Number(payload.total ?? nestedRecords?.total ?? 0),
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
    return { items: data.data?.records ?? [] };
  }

  async updateRecords(datasheetId: string, dto: UpdateMwsRecordsDto, user: UserContext) {
    const data = await this.request(user, 'PATCH', `/datasheets/${datasheetId}/records`, {
      ...dto,
      fieldKey: 'id',
    });
    await this.invalidateDatasheetCache(datasheetId);
    return { items: data.data?.records ?? [] };
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

    return {
      deleted: Boolean(this.unwrapPayload(data) ?? true),
    };
  }

  async resolveTableEmbed(dto: ResolveTableEmbedDto, user: UserContext) {
    const cacheKey = this.userScopedCacheKey(user, `embed:${Buffer.from(JSON.stringify(dto)).toString('base64')}`);
    return this.withCache(cacheKey, 10, async () => {
      const [node, fields, views, preview] = await Promise.all([
        this.getNode(dto.nodeId, user),
        this.listFields(dto.datasheetId, dto.viewId, user),
        this.listViews(dto.datasheetId, user),
        this.listRecords(
          dto.datasheetId,
          {
            viewId: dto.viewId,
            pageSize: dto.pageSize ?? 20,
            pageNum: 1,
            fields: dto.selectedFieldIds?.join(','),
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
          fields: dto.selectedFieldIds?.length
            ? fields.items.filter((field: any) => dto.selectedFieldIds?.includes(field.id))
            : fields.items,
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
    if (typeof sort !== 'string' || !sort.trim()) {
      return query;
    }

    try {
      return {
        ...query,
        sort: JSON.parse(sort),
      };
    } catch {
      return query;
    }
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
