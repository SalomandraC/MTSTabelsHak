import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { ContextSearchService } from 'src/context-engine/context-search.service';
import { SearchDocumentsDto } from './dto/search-documents.dto';

@Controller('/api/v1/search')
export class SearchController {
  constructor(private readonly contextSearchService: ContextSearchService) {}

  @Post('documents')
  searchDocuments(@Body() dto: SearchDocumentsDto, @CurrentUser() user: UserContext) {
    return this.contextSearchService.searchInSpace(user, {
      spaceId: dto.spaceId,
      query: dto.query,
      pageIds: dto.pageIds,
      folderIds: dto.folderIds,
      topK: dto.topK,
    });
  }
}
