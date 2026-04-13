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
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import {
  CreateMwsDatasheetDto,
  CreateMwsFieldDto,
  CreateMwsRecordsDto,
  CreateMwsTablePageDto,
  CreateMwsViewDto,
  MoveMwsFieldDto,
  ResolveTableEmbedDto,
  UpdateMwsRecordsDto,
} from './dto/mws.dto';
import { MwsTablePagesService } from './mws-table-pages.service';
import { MwsService } from './mws.service';

@Controller('/api/v1/mws')
export class MwsController {
  constructor(
    private readonly mwsService: MwsService,
    private readonly tablePagesService: MwsTablePagesService,
  ) {}

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

  @Delete('datasheets/:datasheetId/fields/:fieldId')
  async deleteField(
    @Param('datasheetId') datasheetId: string,
    @Param('fieldId') fieldId: string,
    @Query('spaceId') spaceId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.deleteField(spaceId, datasheetId, fieldId, user);
  }

  @Patch('datasheets/:datasheetId/views/:viewId/fields/:fieldId/index')
  async moveField(
    @Param('datasheetId') datasheetId: string,
    @Param('viewId') viewId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: MoveMwsFieldDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.moveField(datasheetId, viewId, fieldId, dto.index, user);
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

  @Get('datasheets/:datasheetId/records/:recordId/fields/:fieldId')
  async getCellValue(
    @Param('datasheetId') datasheetId: string,
    @Param('recordId') recordId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.getCellValue(datasheetId, recordId, fieldId, user);
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

  @Delete('spaces/:spaceId/datasheets/:datasheetId')
  async deleteDatasheet(
    @Param('spaceId') spaceId: string,
    @Param('datasheetId') datasheetId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.mwsService.deleteDatasheet(spaceId, datasheetId, user);
  }

  @Post('table-embeds/resolve')
  async resolveEmbed(@Body() dto: ResolveTableEmbedDto, @CurrentUser() user: UserContext) {
    return this.mwsService.resolveTableEmbed(dto, user);
  }

  @Post('table-pages')
  async createTablePage(@Body() dto: CreateMwsTablePageDto, @CurrentUser() user: UserContext) {
    return this.tablePagesService.createOrOpenTablePage(dto, user);
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

  @Get('datasheets/:datasheetId/attachments')
  async downloadAttachment(
    @Param('datasheetId') datasheetId: string,
    @Query('token') token: string,
    @CurrentUser() user: UserContext,
    @Res() response: Response,
  ) {
    const file = await this.mwsService.downloadAttachment(datasheetId, token, user);
    response.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.send(file.buffer);
  }
}
