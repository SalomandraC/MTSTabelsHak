import express, { Request, Response } from 'express';
import cors from 'cors';
import { flattenDocument } from './document-parser.js';
import { generatePdf } from './generators/pdf-generator.js';
import { generateDocx } from './generators/docx-generator.js';
import { generateMarkdown } from './generators/md-generator.js';
import type { GenerateRequest, ProseMirrorDocument, ProseMirrorNode } from './types.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3200', 10);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'document-generator' });
});

// Generate document
app.post('/generate', async (req: Request, res: Response) => {
  try {
    const { format, title, document } = req.body as GenerateRequest;

    if (!format || !['pdf', 'docx', 'md'].includes(format)) {
      return res.status(400).json({ error: 'Format must be "pdf", "docx", or "md"' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!document) {
      return res.status(400).json({ error: 'Document is required' });
    }

    // Parse document
    const blocks = parseDocument(document);

    if (blocks.length === 0) {
      return res.status(400).json({ error: 'Document has no content blocks' });
    }

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'pdf':
        buffer = await generatePdf(title, blocks);
        contentType = 'application/pdf';
        filename = `${sanitizeFilename(title)}.pdf`;
        break;

      case 'docx':
        buffer = await generateDocx(title, blocks);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename = `${sanitizeFilename(title)}.docx`;
        break;

      case 'md': {
        const md = generateMarkdown(title, blocks);
        buffer = Buffer.from(md, 'utf-8');
        contentType = 'text/markdown; charset=utf-8';
        filename = `${sanitizeFilename(title)}.md`;
        break;
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: unknown) {
    console.error('Generation error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

function parseDocument(document: GenerateRequest['document']) {
  let pmDoc: ProseMirrorDocument | ProseMirrorNode[];

  // Handle base64-encoded Yjs updates
  if (typeof document === 'string') {
    try {
      pmDoc = JSON.parse(document) as ProseMirrorDocument | ProseMirrorNode[];
    } catch {
      throw new Error('Document must be valid ProseMirror JSON');
    }
  } else if (Array.isArray(document)) {
    pmDoc = document;
  } else if ((document as ProseMirrorDocument).type === 'doc') {
    pmDoc = document as ProseMirrorDocument;
  } else {
    pmDoc = [document as ProseMirrorNode];
  }

  return flattenDocument(pmDoc);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Zа-яА-Я0-9ёЁ\s_-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'document';
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📄 Document Generator service listening on port ${PORT}`);
});
