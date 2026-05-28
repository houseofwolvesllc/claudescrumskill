---
title: Update Before You Start, CHANGELOG entry, package.json version bump
epic: documentation-release
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:documentation-release
  - ready-for-work
persona: impl
blocked_by:
  - foundation/002
  - summary-merged/001
blocks: []
sprint: null
---

## Objective

Final documentation pass: update the orchestrate skill's "Before You Start" to mention the new flags briefly, add the `[1.8.0]` entry to CHANGELOG.md under Keep a Changelog format, and bump `package.json` from `1.7.1` to `1.8.0`.

## Acceptance Criteria

- [ ] `skills/project-orchestrate/SKILL.md` "Before You Start" section gains a brief mention of multi-path mode and the two new flags (`--skip-on-pause`, `--merged`), pointing readers to the Input Parsing and Mode Detection section for full detail.
- [ ] `.claude/skills/project-orchestrate/SKILL.md` mirrors the change.
- [ ] `CHANGELOG.md` gains a `[1.8.0] — <today-date>` entry under Keep a Changelog format. Sections:
  - **Added:** sequential multi-path mode; `depends_on` PRD frontmatter; `--skip-on-pause` and `--merged` flags; queue state file; cumulative summary; slug-suffixed per-spec state archives.
  - **Changed:** `/project-orchestrate` Input Parsing now formally classifies seven invocation patterns; multi-path mode is the new default for 2+ PRD paths.
  - **Backward compatibility note:** Single-path, repo-identifier, no-arg, and single-path+repo invocations are unchanged from 1.7.1.
- [ ] `package.json` version bumped from `1.7.1` to `1.8.0`.
- [ ] No bot/AI attribution markers added to commit message body, CHANGELOG entry, or any file.

## Technical Context

The version bump is a minor bump per SemVer — new feature (multi-path mode), backward compatible (single-path and other modes unchanged).

The CHANGELOG follows the existing pattern set by `[1.7.0]` and `[1.7.1]` entries. Place `[1.8.0]` at the top of the entry list.

Source spec sections to consult:
- Implementation Plan Phase 7 tasks 15-17
- The CHANGELOG format established by previous entries in `CHANGELOG.md`

## Dependencies

- **Blocked by:** foundation/002 (README must already document multi-path), summary-merged/001 (final SKILL.md shape must be set before CHANGELOG describes it)
- **Blocks:** none (last story in the orchestration)
