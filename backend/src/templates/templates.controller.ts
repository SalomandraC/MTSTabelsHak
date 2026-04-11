import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

@Controller('/api/v1/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates(
    @CurrentUser() user: UserContext,
    @Query('spaceId') spaceId?: string,
    @Query('scope') scope?: 'all' | 'mine' | 'space',
    @Query('sort') sort?: 'relevance' | 'newest' | 'popular',
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.templatesService.listTemplates(user, {
      spaceId,
      scope,
      sort,
      search,
      categoryId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('categories')
  listTemplateCategories() {
    return this.templatesService.listCategories();
  }

  @Post()
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: UserContext) {
    return this.templatesService.createTemplate(dto, user);
  }

  @Patch(':templateId')
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.updateTemplate(templateId, dto, user);
  }

  @Delete(':templateId')
  deleteTemplate(@Param('templateId') templateId: string, @CurrentUser() user: UserContext) {
    return this.templatesService.deleteTemplate(templateId, user);
  }

  @Post(':templateId/instantiate')
  instantiateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: InstantiateTemplateDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.templatesService.instantiateTemplate(templateId, dto, user);
  }
}
