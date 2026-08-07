const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_ROOT = path.join(__dirname, '..', 'skills');

// The step audit (docs/residual-scaffolding-audit.md) split every headed step in
// these two skills into fragile sequencing, which stays, and 4.8-era scaffolding,
// which went. These tests pin both halves so a later edit cannot quietly swap one
// for the other.
const CLEANUP = path.join(SKILLS_ROOT, 'project-cleanup', 'SKILL.md');
const ORCHESTRATE = path.join(SKILLS_ROOT, 'project-orchestrate', 'SKILL.md');

const REMOVED_FROM_CLEANUP = [
  /Confirm all required tooling is installed/,
  /re-run the build to confirm the fix didn't introduce new issues/,
  /Re-run the linter to confirm zero remaining issues/,
  /Verify fixes don't break existing tests/,
  /re-run the full suite to confirm all tests pass/,
  /Verify no new lint or build warnings were introduced/,
  /\*\*Don't over-abstract\.\*\*/,
  /\*\*Don't write bad tests\.\*\*/,
  /\*\*Preserve project style\.\*\*/,
];

const REMOVED_FROM_ORCHESTRATE = [
  /explicit affirmation, not a new requirement/,
  /Verify fix by re-checking the specific integration seam/,
  /this should proceed fully autonomously/,
];

function skill(skillPath) {
  return fs.readFileSync(skillPath, 'utf8');
}

function survivorsOf(markdown, removed) {
  return removed.filter(scaffold => scaffold.test(markdown)).map(String);
}

test('project-cleanup carries none of the scaffolding the audit removed', () => {
  const survivors = survivorsOf(skill(CLEANUP), REMOVED_FROM_CLEANUP);

  assert.deepEqual(survivors, [], `scaffolding returned to project-cleanup: ${survivors.join(', ')}`);
});

test('project-orchestrate carries none of the scaffolding the audit removed', () => {
  const survivors = survivorsOf(skill(ORCHESTRATE), REMOVED_FROM_ORCHESTRATE);

  assert.deepEqual(survivors, [], `scaffolding returned to project-orchestrate: ${survivors.join(', ')}`);
});

test('project-cleanup keeps the fix order that dead-code removal depends on', () => {
  const markdown = skill(CLEANUP);

  assert.match(markdown, /\*\*Fix in dependency order\.\*\*/);
  assert.match(
    markdown,
    /dead code removal, build errors, lint issues, project principles compliance, test fixes, coverage improvement/,
  );
});

test('project-cleanup re-runs build and lint after deleting code', () => {
  assert.match(
    skill(CLEANUP),
    /After each batch of removals, re-run the build and linter to confirm nothing broke\./,
  );
});

test('project-cleanup auto-fixes lint before fixing by hand', () => {
  const markdown = skill(CLEANUP);

  assert.ok(
    markdown.indexOf("Run the linter's auto-fix first") <
      markdown.indexOf('Fix remaining issues manually'),
    'the lint auto-fix step no longer precedes the manual pass',
  );
});

test('project-orchestrate aborts when the Workflow tool is absent', () => {
  const markdown = skill(ORCHESTRATE);

  assert.match(markdown, /v2\.0\.0 requires the Claude Code Workflow tool/);
  assert.match(markdown, /Do not proceed\./);
});

test('project-orchestrate withholds authorization from destructive git operations', () => {
  const markdown = skill(ORCHESTRATE);

  assert.match(markdown, /### Standing Authorizations/);
  assert.match(markdown, /\*\*Merge anything to `main`\*\* — always requires explicit human review/);
  assert.match(markdown, /\*\*Force push or destructive git operations\*\* — never permitted/);
  assert.match(markdown, /Never delete `main` or `development`\./);
});

test('project-orchestrate reviews the release before merging it', () => {
  const markdown = skill(ORCHESTRATE);

  assert.ok(
    markdown.indexOf('**Step 5a: Automated Review**') < markdown.indexOf('**Step 5c: Merge'),
    'the review gate no longer precedes the merge',
  );
});

test('project-orchestrate spares gitignored files from the between-story reset', () => {
  assert.match(skill(ORCHESTRATE), /the reset deliberately omits `-x`/);
});

test('project-orchestrate validates every spec before starting any of them', () => {
  const markdown = skill(ORCHESTRATE);

  assert.match(markdown, /All validation runs BEFORE any spec's orchestration begins/);
  assert.match(markdown, /No specs were started\./);
});

test('project-orchestrate deletes the state file only outside multi-path mode', () => {
  const markdown = skill(ORCHESTRATE);

  assert.match(markdown, /rm -f \.claude-scrum-skill\/orchestration-state\.md/);
  assert.match(markdown, /\*\*In multi-path mode, Step 17 is suppressed\.\*\*/);
});

test('project-orchestrate keeps emulation and cleanup mandatory', () => {
  const markdown = skill(ORCHESTRATE);

  assert.match(markdown, /\*\*Phase 2 is mandatory\.\*\*/);
  assert.match(markdown, /\*\*Phase 3 is mandatory\.\*\*/);
});
