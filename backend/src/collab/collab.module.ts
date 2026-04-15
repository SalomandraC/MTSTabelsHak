import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommentsModule } from 'src/comments/comments.module';
import { ContextEngineModule } from 'src/context-engine/context-engine.module';
import { LinksModule } from 'src/links/links.module';
import { DOCUMENT_MAINTENANCE_QUEUE } from 'src/infra/queue/queue.constants';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { CollabController } from './collab.controller';
import { CollabPersistenceService } from './collab-persistence.service';
import { CollabService } from './collab.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { HocuspocusService } from './hocuspocus.service';
import { DocumentMaintenanceProcessor } from './processors/document-maintenance.processor';

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENT_MAINTENANCE_QUEUE }), LinksModule, PageAccessModule, CommentsModule, ContextEngineModule],
  controllers: [CollabController, HistoryController],
  providers: [
    CollabService,
    CollabPersistenceService,
    HistoryService,
    HocuspocusService,
    DocumentMaintenanceProcessor,
  ],
  exports: [CollabService, CollabPersistenceService],
})
export class CollabModule {}
