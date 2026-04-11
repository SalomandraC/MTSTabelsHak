import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';
import { TemplatesService } from './templates.service';

@Controller('/api/v1/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates() {
    return this.templatesService.listTemplates();
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
