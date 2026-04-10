import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DOCUMENT_MAINTENANCE_QUEUE, REINDEX_PAGE_JOB } from 'src/infra/queue/queue.constants';
import { CollabPersistenceService } from '../collab-persistence.service';

@Processor(DOCUMENT_MAINTENANCE_QUEUE)
export class DocumentMaintenanceProcessor extends WorkerHost {
  constructor(private readonly persistenceService: CollabPersistenceService) {
    super();
  }

  async process(job: Job<{ pageId: string; snapshot?: string }>): Promise<void> {
    if (job.name === REINDEX_PAGE_JOB) {
      await this.persistenceService.reindexPage(job.data.pageId, job.data.snapshot);
    }
  }
}
