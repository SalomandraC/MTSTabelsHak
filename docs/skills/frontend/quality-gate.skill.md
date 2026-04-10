# Frontend Quality Gate

## Skill ID

`frontend/quality-gate`

## Purpose

Apply a consistent pre-merge quality gate for frontend changes.

## Use When

- Any non-trivial code change.
- Before creating PR or merge request.
- After refactor touching multiple modules.

## Inputs

- List of changed files
- Available npm scripts
- Feature-specific manual smoke checks

## Procedure

1. Run type/build checks.
2. Run lint/format checks if configured.
3. Perform minimum manual smoke test for affected flow.
4. Document warnings, known limitations, and follow-ups.

## Definition of Done

- Build passes.
- No unaddressed critical errors.
- Manual smoke checks for changed flow are completed.

## Guardrails

- Do not claim success without running checks.
- Do not hide warnings related to changed scope.
- Do not mix unrelated fixes into the same change silently.

## Validation

1. Run `npm run build` in `frontend`.
2. Run `npm run lint` if script exists.
3. Record any remaining warnings with rationale.

## Response Contract

- Include exact checks executed.
- Include pass/fail and warnings.
- Include clear next steps when warnings remain.
