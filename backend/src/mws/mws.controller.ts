import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import {
  CreateMwsDatasheetDto,
  CreateMwsFieldDto,
  CreateMwsRecordsDto,
  CreateMwsViewDto,
  ResolveTableEmbedDto,
  UpdateMwsRecordsDto,
} from './dto/mws.dto';
import { MwsService } from './mws.service';

@Controller('/api/v1/mws')
export class MwsController {
  constructor(private readonly mwsService: MwsService) {}

  @Get('spaces')
  async listSpaces(@CurrentUser() user: UserContext) {
    return this.mwsService.listSpaces(user);
  }

  @Get('spaces/:spaceId/nodes')
  async listNodes(
    @Param('spaceId') spaceId: string,
    @Query('type') type: string | undefined,
    @Query('includeChildren') includeChildren = 'true',
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.listNodes(spaceId, type, includeChildren !== 'false', user);
  }

  @Get('nodes/:nodeId')
  async getNode(@Param('nodeId') nodeId: string, @CurrentUser() user: UserContext) {
    return this.mwsService.getNode(nodeId, user);
  }

  @Post('spaces/:spaceId/datasheets')
  async createDatasheet(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateMwsDatasheetDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.createDatasheet(spaceId, dto, user);
  }

  @Get('datasheets/:datasheetId/fields')
  async listFields(
    @Param('datasheetId') datasheetId: string,
    @Query('viewId') viewId: string | undefined,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.listFields(datasheetId, viewId, user);
  }

  @Post('datasheets/:datasheetId/fields')
  async createField(
    @Param('datasheetId') datasheetId: string,
    @Query('spaceId') spaceId: string,
    @Body() dto: CreateMwsFieldDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.createField(spaceId, datasheetId, dto, user);
  }

  @Get('datasheets/:datasheetId/views')
  async listViews(@Param('datasheetId') datasheetId: string, @CurrentUser() user: UserContext) {
    return this.mwsService.listViews(datasheetId, user);
  }

  @Post('datasheets/:datasheetId/views')
  async createView(
    @Param('datasheetId') datasheetId: string,
    @Query('spaceId') spaceId: string,
    @Body() dto: CreateMwsViewDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.createView(spaceId, datasheetId, dto, user);
  }

  @Get('datasheets/:datasheetId/records')
  async listRecords(
    @Param('datasheetId') datasheetId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.listRecords(datasheetId, query, user);
  }

  @Post('datasheets/:datasheetId/records')
  async createRecords(
    @Param('datasheetId') datasheetId: string,
    @Body() dto: CreateMwsRecordsDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.createRecords(datasheetId, dto, user);
  }

  @Patch('datasheets/:datasheetId/records')
  async updateRecords(
    @Param('datasheetId') datasheetId: string,
    @Body() dto: UpdateMwsRecordsDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.updateRecords(datasheetId, dto, user);
  }

  @Delete('datasheets/:datasheetId/records')
  async deleteRecords(
    @Param('datasheetId') datasheetId: string,
    @Query('recordIds') recordIds: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.deleteRecords(datasheetId, recordIds.split(','), user);
  }

  @Post('table-embeds/resolve')
  async resolveEmbed(@Body() dto: ResolveTableEmbedDto, @CurrentUser() user: UserContext) {
    return this.mwsService.resolveTableEmbed(dto, user);
  }

  @Post('datasheets/:datasheetId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('datasheetId') datasheetId: string,
    @Query('recordId') recordId: string | undefined,
    @Query('fieldId') fieldId: string | undefined,
    @UploadedFile() file: any,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.uploadAttachment(datasheetId, recordId, fieldId, file, user);
  }
}
