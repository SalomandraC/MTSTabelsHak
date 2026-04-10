# Создать скиллы для работы с фронтендом

## Цель
Создать базовые скиллы для работы с фронтендом, которые позволят эффективно разрабатывать и поддерживать пользовательский интерфейс. Эти скиллы будут включать в себя знания и умения, необходимые для создания современных веб-приложений, а также понимание лучших практик в области фронтенд-разработки. Поддержки текущей архитектуры и технологий, используемых в проекте, таких как React, Tailwind CSS и Tiptap, использование prettier, linting будет ключевым аспектом при разработке этих скиллов

## Результат

Создан унифицированный каталог скиллов, который можно использовать и для GitHub Copilot, и для Qwen через адаптерные инструкции.

### Базовая структура

- `docs/skills/README.md` — общие правила и адаптеры для Copilot/Qwen.
- `docs/skills/template.skill.md` — канонический шаблон skill card.
- `docs/skills/frontend/index.md` — индекс фронтенд-скиллов.

### Реализованные frontend skills

- `docs/skills/frontend/architecture-guard.skill.md`
- `docs/skills/frontend/page-editor-tiptap.skill.md`
- `docs/skills/frontend/slash-menu-commands.skill.md`
- `docs/skills/frontend/page-metadata.skill.md`
- `docs/skills/frontend/autosave-sync.skill.md`
- `docs/skills/frontend/tailwind-consistency.skill.md`
- `docs/skills/frontend/responsive-a11y.skill.md`
- `docs/skills/frontend/quality-gate.skill.md`

## Критерии унификации

Все карточки используют единый формат секций:

1. Skill ID
2. Purpose
3. Use When
4. Inputs
5. Procedure
6. Definition of Done
7. Guardrails
8. Validation
9. Response Contract

Это позволяет переиспользовать один и тот же контент в разных агентах без переписывания сути скилла.

## Next steps

- Add adapter snippets for GitHub Copilot and Qwen in `docs/skills/adapters/` (short templates for injecting skill cards into agent prompts).
- Optionally add `collaboration-yjs` and `table-embed` skill cards when those features are near implementation; they were sketched during work but not added to the canonical `docs/skills/frontend` list above.
- Consider adding small usage examples (1-2 commands) per card to demonstrate exact phrasing for agents.