import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import { TemplatesService } from './templates.service';

@Controller('/api/v1/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates(@CurrentUser() user: UserContext, @Query('spaceId') spaceId?: string) {
    return this.templatesService.listTemplates(user, spaceId);
  }

  @Post()
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: UserContext) {
    return this.templatesService.createTemplate(dto, user);
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
