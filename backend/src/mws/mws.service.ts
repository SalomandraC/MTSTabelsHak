import {
  BadGatewayException,
  Injectable,
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

@Injectable()
export class MwsService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'MWS_TABLES_BASE_URL',
      'https://tables.mws.ru/fusion/v1',
    );
  }

  async listSpaces(user: UserContext) {
    return this.withCache('mws:spaces', 60, () =>
      this.request(user, 'GET', '/spaces').then((data) => ({
        items: data.data?.spaces ?? [],
      })),
    );
  }

  async listNodes(spaceId: string, type: string | undefined, includeChildren: boolean, user: UserContext) {
    const cacheKey = `mws:nodes:${spaceId}:${type ?? 'all'}:${includeChildren ? 'tree' : 'flat'}`;
    return this.withCache(cacheKey, 30, async () => {
      const data = await this.request(user, 'GET', `/spaces/${spaceId}/nodes`, undefined, { type });
      const nodes = data.data?.nodes ?? [];
      return {
        items: includeChildren ? nodes : this.flattenNodes(nodes),
      };
    });
  }

  async getNode(nodeId: string, user: UserContext) {
    const data = await this.request(user, 'GET', `/nodes/${nodeId}`);
    return { item: data.data };
  }

  async createDatasheet(spaceId: string, dto: CreateMwsDatasheetDto, user: UserContext) {
    const data = await this.request(user, 'POST', `/spaces/${spaceId}/datasheets`, dto);
    return {
      datasheet: {
        id: data.data?.id,
        name: dto.name,
        createdAt: data.data?.createdAt ? new Date(data.data.createdAt).toISOString() : null,
        fields: data.data?.fields ?? [],
      },
    };
  }

  async listFields(datasheetId: string, viewId: string | undefined, user: UserContext) {
    const cacheKey = `mws:fields:${datasheetId}:${viewId ?? 'default'}`;
    return this.withCache(cacheKey, 300, async () => {
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/fields`, undefined, {
        viewId,
      });
      return {
        items: data.data?.fields ?? [],
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
    await this.redisService.del(`mws:fields:${datasheetId}:default`);
    return { field: data.data };
  }

  async listViews(datasheetId: string, user: UserContext) {
    const cacheKey = `mws:views:${datasheetId}`;
    return this.withCache(cacheKey, 300, async () => {
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/views`);
      return {
        items: data.data?.views ?? [],
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
    await this.redisService.del(`mws:views:${datasheetId}`);
    return { view: data.data };
  }

  async listRecords(
    datasheetId: string,
    query: Record<string, unknown>,
    user: UserContext,
  ) {
    const cacheKey = `mws:records:${datasheetId}:${Buffer.from(JSON.stringify(query)).toString('base64')}`;
    return this.withCache(cacheKey, 10, async () => {
      const data = await this.request(user, 'GET', `/datasheets/${datasheetId}/records`, undefined, query);
      return {
        items: data.data?.records ?? [],
        pageNum: data.data?.pageNum ?? Number(query.pageNum ?? 1),
        pageSize: data.data?.pageSize ?? Number(query.pageSize ?? 50),
        total: data.data?.total ?? 0,
      };
    });
  }

  async createRecords(datasheetId: string, dto: CreateMwsRecordsDto, user: UserContext) {
    const data = await this.request(user, 'POST', `/datasheets/${datasheetId}/records`, dto);
    return { items: data.data?.records ?? [] };
  }

  async updateRecords(datasheetId: string, dto: UpdateMwsRecordsDto, user: UserContext) {
    const data = await this.request(user, 'PATCH', `/datasheets/${datasheetId}/records`, dto);
    return { items: data.data?.records ?? [] };
  }

  async deleteRecords(datasheetId: string, recordIds: string[], user: UserContext) {
    const data = await this.request(user, 'DELETE', `/datasheets/${datasheetId}/records`, undefined, {
      recordIds: recordIds.join(','),
    });
    return {
      deleted: Boolean(data.data),
    };
  }

  async resolveTableEmbed(dto: ResolveTableEmbedDto, user: UserContext) {
    const cacheKey = `mws:embed:${Buffer.from(JSON.stringify(dto)).toString('base64')}`;
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
          },
          user,
        ),
      ]);

      return {
        embed: {
          node: node.item,
          datasheetId: dto.datasheetId,
          view: views.items.find((item: any) => item.id === dto.viewId) ?? null,
          fields: dto.selectedFieldIds?.length
            ? fields.items.filter((field: any) => dto.selectedFieldIds?.includes(field.id))
            : fields.items,
          preview,
          capabilities: {
            canInlineEdit: Boolean(dto.allowInlineEdit),
            canCreateRecords: true,
            canDeleteRecords: true,
            canUploadAttachments: true,
          },
          openInMwsUrl: null,
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

    return { attachment: data.data };
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

  private flattenNodes(nodes: any[]): any[] {
    const result: any[] = [];
    const visit = (node: any) => {
      result.push({ ...node, children: undefined });
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };
    nodes.forEach(visit);
    return result;
  }

  private async request(
    user: UserContext,
    method: HttpMethod,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ) {
    const token = user.mwsToken ?? user.authToken;
    if (!token) {
      throw new UnauthorizedException('MWS Tables token is required');
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
      throw new BadGatewayException({
        code: 'MWS_UPSTREAM_ERROR',
        message,
        upstream: 'MWS_TABLES',
        upstreamStatus: status ?? 502,
      });
    }
  }
}
