---
title: Add new config keys to shared/config.json
epic: foundation
status: done
executor: claude
priority: P0-critical
points: 2
labels:
  - type:story
  - executor:claude
  - P0-critical
  - epic:foundation
persona: impl
blocked_by: []
blocks:
  - two-pass-scaffolding/001
  - two-pass-scaffolding/002
  - two-pass-scaffolding/003
  - design-spike-epic/001
sprint: 1
---

## Objective

Add three new configuration keys to `skills/shared/config.json` with documented defaults, so two-pass and design-spike behavior is configurable and adheres to FR-18/FR-19 of the source spec.

## Acceptance Criteria

- [ ] `skills/shared/config.json` contains `scaffold.two_pass_threshold_words` with default `5000`
- [ ] `skills/shared/config.json` contains `scaffold.design_spike_enabled` with default `true`
- [ ] `skills/shared/config.json` contains `paths.context` with default `.claude-scrum-skill/context`
- [ ] The same three keys are added to `.claude/skills/shared/config.json` (the project's local copy)
- [ ] Existing keys (scaffolding, paths.specs, paths.adr, paths.backlog, jira.project_key, trello.board_id) are preserved unchanged
- [ ] JSON remains valid (verify with `jq . config.json` after editing)

## Technical Context

There are two `config.json` files in this repo that must be kept in sync:
- `skills/shared/config.json` — canonical source shipped with the npm package
- `.claude/skills/shared/config.json` — local development copy (already deployed)

Both files currently have a flat top-level structure. The `scaffold.*` keys are a new nested object; add a `scaffold` key with sub-keys `two_pass_threshold_words` and `design_spike_enabled`. The `paths.context` key is added inside the existing `paths` object.

Final shape:
```json
{
    "scaffolding": "local",
    "paths": {
        "specs": "...",
        "adr": "...",
        "backlog": "...",
        "context": ".claude-scrum-skill/context"
    },
    "scaffold": {
        "two_pass_threshold_words": 5000,
        "design_spike_enabled": true
    },
    "jira": { ... },
    "trello": { ... }
}
```

Per FR-19, missing keys must fall back to defaults silently. This story only adds the keys to the shipped configs; the fallback handling is implemented as part of the two-pass-scaffolding epic's stories.

## Dependencies

- **Blocked by:** none
- **Blocks:** two-pass-scaffolding/001, two-pass-scaffolding/002, two-pass-scaffolding/003, design-spike-epic/001
