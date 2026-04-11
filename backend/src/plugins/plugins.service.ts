import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserContext } from 'src/auth/user-context';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import {
  pluginDefinitions,
  pluginPlans,
  type PluginDefinition,
  type PluginPlanId,
} from './plugin-definitions';

type PluginStatus = 'core' | 'enabled' | 'available' | 'locked' | 'comingSoon';

function isPlanAllowed(definition: PluginDefinition, planId: PluginPlanId): boolean {
  if (!definition.requiredPlans || definition.requiredPlans.length === 0) {
    return true;
  }

  return definition.requiredPlans.includes(planId);
}

function parsePlanMap(rawValue: string | undefined): Record<string, PluginPlanId> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string>;
    return Object.entries(parsed).reduce<Record<string, PluginPlanId>>((accumulator, [userId, planId]) => {
      if (planId === 'free' || planId === 'pro' || planId === 'enterprise') {
        accumulator[userId] = planId;
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getCatalogForUser(user: UserContext) {
    const planId = this.resolvePlanId(user);
    const plan = pluginPlans[planId];
    const overrides = await this.prisma.pluginActivation.findMany({
      where: {
        userId: user.userId,
        scopeType: 'user',
      },
    });
    const overrideMap = new Map<string, { enabled: boolean; settings: string | null }>();
    for (const item of overrides) {
      overrideMap.set(item.pluginId, { enabled: item.isEnabled, settings: item.settings });
    }

    const items = pluginDefinitions.map((definition) => {
      const planAllowed = isPlanAllowed(definition, planId);
      const override = overrideMap.get(definition.id);
      const explicitState = override?.enabled;
      const enabled = definition.kind === 'core'
        ? true
        : Boolean(planAllowed && definition.implemented && (explicitState ?? definition.defaultEnabled));

      // merge settings: user overrides > defaults
      let settings = definition.defaultSettings ?? {};
      if (override?.settings) {
        try {
          settings = { ...settings, ...JSON.parse(override.settings) };
        } catch {
          // keep defaults if parse fails
        }
      }

      let status: PluginStatus = 'available';
      let lockedReason: string | null = null;

      if (definition.kind === 'core') {
        status = 'core';
      } else if (!planAllowed) {
        status = 'locked';
        lockedReason = `Доступно на тарифе: ${definition.requiredPlans?.join(', ')}.`;
      } else if (!definition.implemented) {
        status = 'comingSoon';
        lockedReason = 'Запланировано, но еще не реализовано в текущем MVP.';
      } else if (enabled) {
        status = 'enabled';
      }

      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        kind: definition.kind,
        placement: definition.placement,
        requiredPlans: definition.requiredPlans ?? [],
        implemented: definition.implemented,
        enabled,
        canToggle: definition.kind === 'optional' && planAllowed && definition.implemented,
        status,
        lockedReason,
        settings,
      };
    });

    return {
      plan,
      items,
    };
  }

  async activatePlugin(user: UserContext, pluginId: string) {
    const definition = this.getOptionalImplementedPluginOrThrow(pluginId);
    const planId = this.resolvePlanId(user);

    if (!isPlanAllowed(definition, planId)) {
      throw new BadRequestException('Plugin is not available for the current subscription plan');
    }

    await this.prisma.pluginActivation.upsert({
      where: {
        pluginId_scopeType_userId: {
          pluginId,
          scopeType: 'user',
          userId: user.userId,
        },
      },
      create: {
        pluginId,
        scopeType: 'user',
        userId: user.userId,
        isEnabled: true,
      },
      update: {
        isEnabled: true,
      },
    });

    return this.getCatalogForUser(user);
  }

  async deactivatePlugin(user: UserContext, pluginId: string) {
    const definition = this.getOptionalImplementedPluginOrThrow(pluginId);
    const planId = this.resolvePlanId(user);

    if (!isPlanAllowed(definition, planId)) {
      throw new BadRequestException('Plugin is not available for the current subscription plan');
    }

    await this.prisma.pluginActivation.upsert({
      where: {
        pluginId_scopeType_userId: {
          pluginId,
          scopeType: 'user',
          userId: user.userId,
        },
      },
      create: {
        pluginId,
        scopeType: 'user',
        userId: user.userId,
        isEnabled: false,
      },
      update: {
        isEnabled: false,
      },
    });

    return this.getCatalogForUser(user);
  }

  async updatePluginSettings(user: UserContext, pluginId: string, settings: Record<string, boolean>) {
    const definition = this.getOptionalImplementedPluginOrThrow(pluginId);
    const planId = this.resolvePlanId(user);

    if (!isPlanAllowed(definition, planId)) {
      throw new BadRequestException('Plugin is not available for the current subscription plan');
    }

    await this.prisma.pluginActivation.upsert({
      where: {
        pluginId_scopeType_userId: {
          pluginId,
          scopeType: 'user',
          userId: user.userId,
        },
      },
      create: {
        pluginId,
        scopeType: 'user',
        userId: user.userId,
        isEnabled: true,
        settings: JSON.stringify(settings),
      },
      update: {
        settings: JSON.stringify(settings),
      },
    });

    return this.getCatalogForUser(user);
  }

  private resolvePlanId(user: UserContext): PluginPlanId {
    const configuredDefault = this.configService.get<string>('DEFAULT_PLUGIN_PLAN', 'enterprise');
    const defaultPlanId = configuredDefault === 'free' || configuredDefault === 'enterprise'
      ? configuredDefault
      : configuredDefault === 'pro'
        ? configuredDefault
        : 'enterprise';
    const explicitPlanMap = parsePlanMap(this.configService.get<string>('PLUGIN_USER_PLAN_MAP'));

    return explicitPlanMap[user.userId] ?? defaultPlanId;
  }

  private getOptionalImplementedPluginOrThrow(pluginId: string): PluginDefinition {
    const definition = pluginDefinitions.find((item) => item.id === pluginId);

    if (!definition) {
      throw new NotFoundException('Plugin not found');
    }

    if (definition.kind !== 'optional') {
      throw new BadRequestException('Core plugins cannot be toggled');
    }

    if (!definition.implemented) {
      throw new BadRequestException('Plugin is not implemented yet');
    }

    return definition;
  }
}
