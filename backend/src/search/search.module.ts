import { Module } from '@nestjs/common';
import { ContextEngineModule } from 'src/context-engine/context-engine.module';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ContextEngineModule, PageAccessModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
