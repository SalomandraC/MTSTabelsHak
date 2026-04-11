import { templateCatalog } from './template-catalog';
import { renderTemplateDocument, renderTemplateString } from './template-renderer';

describe('template renderer', () => {
  it('replaces repeated template variables with provided values', () => {
    const template = templateCatalog.find((item) => item.id === 'mts-resume');

    expect(template).toBeDefined();

    const document = renderTemplateDocument(template!, {
      fullName: 'Иван Иванов',
      position: 'Frontend Engineer',
      city: 'Москва',
      experience: '5 лет в продуктовой разработке',
      skills: 'React, TypeScript, Tiptap',
      motivation: 'Хочу развивать клиентские продукты МТС',
    });

    expect(JSON.stringify(document)).toContain('Иван Иванов');
    expect(JSON.stringify(document)).toContain('Frontend Engineer');
    expect(JSON.stringify(document)).not.toContain('templateVariable');
  });

  it('renders page titles from template values', () => {
    const title = renderTemplateString('Ретро - {{sprintName}}', {
      sprintName: 'Sprint 24',
    });

    expect(title).toBe('Ретро - Sprint 24');
  });
});
