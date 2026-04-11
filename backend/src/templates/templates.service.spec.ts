import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  it('instantiates template with substituted values in default Yjs fragment', async () => {
    const createPage = jest.fn(async (payload: any) => ({
      page: {
        id: 'page-1',
        title: payload.title,
      },
    }));

    const service = new TemplatesService({ createPage } as any);

    await service.instantiateTemplate(
      'mts-resume',
      {
        spaceId: 'space-1',
        values: {
          fullName: 'Иван Иванов',
          position: 'Frontend Engineer',
          city: 'Москва',
          experience: '5 лет в продуктовой разработке',
          skills: 'React, TypeScript, Tiptap',
          motivation: 'Хочу развивать клиентские продукты МТС',
        },
      } as any,
      { userId: 'user-1', displayName: 'Demo User' } as any,
    );

    expect(createPage).toHaveBeenCalledTimes(1);

    const payload = createPage.mock.calls[0][0];
    expect(payload.initialContent?.value).toBeTruthy();

    const update = Buffer.from(payload.initialContent.value, 'base64');
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, new Uint8Array(update));

    const json = yDocToProsemirrorJSON(ydoc, 'default') as Record<string, any>;
    const serialized = JSON.stringify(json);

    expect(serialized).toContain('Иван Иванов');
    expect(serialized).toContain('Frontend Engineer');
    expect(serialized).not.toContain('templateVariable');
  });
});
