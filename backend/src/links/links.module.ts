import { Module } from '@nestjs/common';
import { DocumentIndexingService } from './document-indexing.service';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

@Module({
  controllers: [LinksController],
  providers: [DocumentIndexingService, LinksService],
  exports: [DocumentIndexingService, LinksService],
})
export class LinksModule {}
