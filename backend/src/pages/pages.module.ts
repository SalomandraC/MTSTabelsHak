import { Module } from '@nestjs/common';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { SearchModule } from 'src/search/search.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [SearchModule, PageAccessModule],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
