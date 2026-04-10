import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CollabModule } from 'src/collab/collab.module';
import { MwsModule } from 'src/mws/mws.module';
import { AiToolsController } from './ai-tools.controller';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { WikiDocumentInjectionService } from './wiki-document-injection.service';
import { AiProviderClientService } from './ai-provider-client.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [HttpModule, MwsModule, CollabModule],
  controllers: [AiToolsController],
  providers: [
    AiProviderClientService,
    AiAssistantService,
    AiChatService,
    AiToolRegistryService,
    WikiDocumentInjectionService,
  ],
  exports: [AiProviderClientService, AiAssistantService, AiChatService, AiToolRegistryService, WikiDocumentInjectionService],
})
export class AiToolsModule {}