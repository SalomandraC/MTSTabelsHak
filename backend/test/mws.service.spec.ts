import { UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { MwsService } from '../src/mws/mws.service';

describe('MwsService auth token source', () => {
  const redisService = {
    getJson: jest.fn(async () => null),
    setJson: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
  };

  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'MWS_TABLES_BASE_URL') {
        return 'https://tables.mws.ru/fusion/v1';
      }
      return fallback;
    }),
  };

  const httpService = {
    request: jest.fn(),
  };

  let service: MwsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MwsService(httpService as any, configService as any, redisService as any);
  });

  it('uses token from user context as Bearer header', async () => {
    httpService.request.mockReturnValue(
      of({
        data: {
          data: {
            spaces: [],
          },
        },
      }),
    );

    await service.listSpaces({ userId: 'u1', displayName: 'User', mwsToken: 'abc123' });

    expect(httpService.request).toHaveBeenCalledTimes(1);
    expect(httpService.request.mock.calls[0][0].headers.Authorization).toBe('Bearer abc123');
  });

  it('fails when no token exists in user context', async () => {
    await expect(
      service.listSpaces({ userId: 'u1', displayName: 'User' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});