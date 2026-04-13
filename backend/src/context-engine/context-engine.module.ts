import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { ContextEngineClient } from './context-engine.client';
import { ContextIndexingService } from './context-indexing.service';
import { ContextSearchService } from './context-search.service';

@Module({
  imports: [HttpModule, PageAccessModule],
  providers: [ContextEngineClient, ContextIndexingService, ContextSearchService],
  exports: [ContextEngineClient, ContextIndexingService, ContextSearchService],
})
export class ContextEngineModule {}
