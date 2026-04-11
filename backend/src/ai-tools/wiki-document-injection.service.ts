import { Injectable } from '@nestjs/common';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import { CollabPersistenceService } from 'src/collab/collab-persistence.service';
import { SmartImportCandidate, EditorCommandEnvelope } from './ai-tool-registry.types';

@Injectable()
export class WikiDocumentInjectionService {
  constructor(private readonly collabPersistenceService: CollabPersistenceService) {}

  buildInsertEmbedCommand(candidate: SmartImportCandidate, pageId?: string): EditorCommandEnvelope {
    return {
      type: 'editor.apply',
      pageId,
      commands: [
        {
          op: 'insert_block',
          block: {
            type: 'mwsTableEmbed',
            attrs: {
              spaceId: candidate.spaceId,
              nodeId: candidate.nodeId,
              datasheetId: candidate.datasheetId,
              viewId: candidate.viewId ?? null,
              selectedFieldIds: candidate.selectedFieldIds,
              displayMode: 'table',
              allowInlineEdit: false,
              syncState: 'loading',
            },
          },
        },
      ],
    };
  }

  buildRefreshEmbedCommand(pageId: string, datasheetId: string, viewId?: string | null): EditorCommandEnvelope {
    return {
      type: 'editor.apply',
      pageId,
      commands: [
        {
          op: 'refresh_block',
          target: {
            type: 'mwsTableEmbed',
            datasheetId,
            viewId: viewId ?? null,
          },
        },
      ],
    };
  }

  async applyCommandsToPage(pageId: string, envelope: EditorCommandEnvelope): Promise<Record<string, any>> {
    if (!envelope.commands.length) {
      return { type: 'doc', content: [] };
    }

    const ydoc = await this.collabPersistenceService.loadDocument(pageId);
    const pmDoc = (yDocToProsemirrorJSON(ydoc) as Record<string, any> | null) ?? {
      type: 'doc',
      content: [],
    };
    const nextDoc = this.applyCommandsToDocument(pmDoc, envelope.commands);
    return nextDoc;
  }

  private applyCommandsToDocument(doc: Record<string, any>, commands: Array<Record<string, unknown>>): Record<string, any> {
    let nextDoc = structuredClone(doc);

    for (const command of commands) {
      if (command.op === 'insert_block') {
        const content = Array.isArray(nextDoc.content) ? nextDoc.content : [];
        content.push(command.block);
        nextDoc = {
          ...nextDoc,
          content,
        };
      }
    }

    return nextDoc;
  }
}