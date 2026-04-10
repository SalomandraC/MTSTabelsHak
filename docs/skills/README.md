# Skills Catalog (Unified for Copilot and Qwen)

This directory stores project skill cards in a vendor-neutral format.

## Goal

Keep one canonical skill description and reuse it with different assistants:

- GitHub Copilot (custom instructions / prompts / agent mode)
- Qwen (system prompt / role prompt / workflow prompt)

## Canonical Format

Each skill card is a Markdown file with strict sections:

1. `Skill ID`
2. `Purpose`
3. `Use When`
4. `Inputs`
5. `Procedure`
6. `Definition of Done`
7. `Guardrails`
8. `Validation`
9. `Response Contract`

The card content should not contain vendor-specific instructions.

## How to Use with Copilot

1. Pick relevant skill cards for the current task.
2. Attach or paste card content into working context.
3. Ask Copilot to follow the selected card `Procedure`, `Guardrails`, and `Validation`.

Minimal adapter instruction:

```md
Use the following skill card(s) as mandatory workflow constraints.
Prioritize Procedure, then Guardrails, then Validation.
If a requirement conflicts with code reality, report the conflict explicitly.
```

## How to Use with Qwen

1. Pick relevant skill cards for the current task.
2. Inject card text into system/developer/user prompt context.
3. Require strict completion against `Definition of Done` and `Validation`.

Minimal adapter instruction:

```md
Follow the skill card sections in order: Use When -> Inputs -> Procedure -> Guardrails -> Validation.
Return output according to Response Contract.
Do not skip validation steps.
```

## Versioning Rules

- One file per skill card.
- Keep cards short and actionable.
- Update `docs/skills/frontend/index.md` when adding/removing cards.
- If architecture changes, first update `docs/info/architecture.md`, then affected cards.

## Existing Frontend Skill Cards

The frontend skill cards currently present in the repository are:

- `docs/skills/frontend/architecture-guard.skill.md`
- `docs/skills/frontend/page-editor-tiptap.skill.md`
- `docs/skills/frontend/slash-menu-commands.skill.md`
- `docs/skills/frontend/page-metadata.skill.md`
- `docs/skills/frontend/autosave-sync.skill.md`
- `docs/skills/frontend/tailwind-consistency.skill.md`
- `docs/skills/frontend/responsive-a11y.skill.md`
- `docs/skills/frontend/quality-gate.skill.md`
 - `docs/skills/frontend/tiptap-extension.skill.md`
 - `docs/skills/frontend/architecture-guard.skill.md`
 - `docs/skills/frontend/page-editor-tiptap.skill.md`
 - `docs/skills/frontend/slash-menu-commands.skill.md`
 - `docs/skills/frontend/page-metadata.skill.md`
 - `docs/skills/frontend/autosave-sync.skill.md`
 - `docs/skills/frontend/tailwind-consistency.skill.md`
 - `docs/skills/frontend/responsive-a11y.skill.md`
 - `docs/skills/frontend/quality-gate.skill.md`

If you add or remove skill files, update `docs/skills/frontend/index.md` to keep the index in sync.
