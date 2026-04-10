import { Module } from '@nestjs/common';
import { CollabModule } from 'src/collab/collab.module';
import { MwsModule } from 'src/mws/mws.module';
import { AiToolsController } from './ai-tools.controller';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { WikiDocumentInjectionService } from './wiki-document-injection.service';

@Module({
  imports: [MwsModule, CollabModule],
  controllers: [AiToolsController],
  providers: [AiToolRegistryService, WikiDocumentInjectionService],
  exports: [AiToolRegistryService, WikiDocumentInjectionService],
})
export class AiToolsModule {}