import { Body, Controller, Post } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { ObsidianAuthDto } from './dto/obsidian-auth.dto';
import { ObsidianImportPreviewDto, ObsidianImportRunDto } from './dto/obsidian-import.dto';
import { ObsidianService } from './obsidian.service';

@Controller('/api/v1/obsidian')
export class ObsidianController {
  constructor(private readonly obsidianService: ObsidianService) {}

  @Public()
  @Post('spaces')
  async listSpaces(@Body() dto: ObsidianAuthDto) {
    return this.obsidianService.listSpaces(dto.apiKey);
  }

  @Public()
  @Post('import/preview')
  async previewImport(@Body() dto: ObsidianImportPreviewDto) {
    return this.obsidianService.previewImport(dto);
  }

  @Public()
  @Post('import')
  async runImport(@Body() dto: ObsidianImportRunDto) {
    return this.obsidianService.runImport(dto);
  }
}
