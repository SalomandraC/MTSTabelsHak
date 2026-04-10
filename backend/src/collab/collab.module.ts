import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LinksModule } from 'src/links/links.module';
import { DOCUMENT_MAINTENANCE_QUEUE } from 'src/infra/queue/queue.constants';
import { CollabController } from './collab.controller';
import { CollabPersistenceService } from './collab-persistence.service';
import { CollabService } from './collab.service';
import { HocuspocusService } from './hocuspocus.service';
import { DocumentMaintenanceProcessor } from './processors/document-maintenance.processor';

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENT_MAINTENANCE_QUEUE }), LinksModule],
  controllers: [CollabController],
  providers: [
    CollabService,
    CollabPersistenceService,
    HocuspocusService,
    DocumentMaintenanceProcessor,
  ],
  exports: [CollabService, CollabPersistenceService],
})
export class CollabModule {}
