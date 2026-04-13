import { Module } from '@nestjs/common';
import { ContextEngineModule } from 'src/context-engine/context-engine.module';
import { MwsModule } from 'src/mws/mws.module';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { SearchModule } from 'src/search/search.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [SearchModule, PageAccessModule, MwsModule, ContextEngineModule],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
