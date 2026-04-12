import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PluginsService } from './plugins.service';

@Controller('/api/v1/plugins')
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get('/catalog')
  async getCatalog(@CurrentUser() user: UserContext) {
    return this.pluginsService.getCatalogForUser(user);
  }

  @Post(':pluginId/activate')
  async activatePlugin(@Param('pluginId') pluginId: string, @CurrentUser() user: UserContext) {
    return this.pluginsService.activatePlugin(user, pluginId);
  }

  @Post(':pluginId/deactivate')
  async deactivatePlugin(@Param('pluginId') pluginId: string, @CurrentUser() user: UserContext) {
    return this.pluginsService.deactivatePlugin(user, pluginId);
  }

  @Patch(':pluginId/settings')
  async updateSettings(
    @Param('pluginId') pluginId: string,
    @CurrentUser() user: UserContext,
    @Body('settings') settings: Record<string, boolean>,
  ) {
    return this.pluginsService.updatePluginSettings(user, pluginId, settings);
  }
}
