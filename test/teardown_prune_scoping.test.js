const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Teardown is the one stage that deletes work. The pipeline selects the paths
// itself and hands the removal agent a rendered command list with no discretion
// (ADR-0009), so the danger is not the agent — it is the prompt drifting into an
// instruction the agent could apply to the whole repository. These tests pin the
// prompt to pruneWorktreeCommands and pin every removal it can print to a path.
const PIPELINE = path.join(__dirname, '..', 'lib', 'workflows', 'sprint_pipeline.js');

const TEARDOWN_PROMPT_PATTERN = /function buildTeardownPrompt\([\s\S]*?\n}/;
const RENDERED_FROM_PRUNE_COMMANDS = /pruneWorktreeCommands\(paths\)\.map\(renderGitCommand\)/;
const RENDERED_COMMAND_BLOCK = /\$\{commands\.map\(command => `  \$\{command\}`\)\.join\('\\n'\)\}/;
// `['worktree', 'remove', ...]` — the tuple renderGitCommand turns into a line
// the removal agent runs.
const REMOVAL_TUPLE_PATTERN = /\[\s*'worktree',\s*'remove'[^\]]*\]/g;
// A removal written straight into a prompt instead of built from the tuple.
const LITERAL_REMOVAL_PATTERN = /git worktree remove[^\n`]*/g;
const PRUNE_MENTION_PATTERN = /[^\n]*git worktree prune[^\n]*/g;
const FORBIDDEN_BARE_PRUNE = /never run a bare \\`git worktree prune\\`/;

const UNSCOPED_IS_UNSAFE =
  'an unscoped prune reaches worktrees this sprint never created — other sprints and other agents ' +
  'hold worktrees in this same repository, and removing theirs destroys their uncommitted work';

function pipelineSource() {
  return fs.readFileSync(PIPELINE, 'utf8');
}

// Comments discuss the unsafe forms in order to rule them out; only what the
// pipeline can hand an agent counts as a removal it can emit.
function executableSource() {
  return pipelineSource()
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
}

function teardownPrompt() {
  const [source] = pipelineSource().match(TEARDOWN_PROMPT_PATTERN) ?? [];

  assert.ok(source, 'buildTeardownPrompt is missing from the pipeline');

  return source;
}

function matchesIn(source, pattern) {
  return [...source.matchAll(pattern)].map(([match]) => match.trim());
}

function removalsIn(source) {
  return [...matchesIn(source, REMOVAL_TUPLE_PATTERN), ...matchesIn(source, LITERAL_REMOVAL_PATTERN)];
}

// The last argument of a removal that carries one is the worktree's path; a
// removal that stops at the verb or at a flag takes whatever tree it lands in.
function carriesExplicitPath(removal) {
  const args = removal.replace(/[[\]'`]/g, '').split(/,\s*|\s+/).filter(Boolean);
  const last = args.at(-1);

  return last !== 'remove' && !last.startsWith('--');
}

test('the teardown prompt renders the commands pruneWorktreeCommands builds', () => {
  const prompt = teardownPrompt();

  assert.match(prompt, RENDERED_FROM_PRUNE_COMMANDS, `the teardown prompt builds removals of its own: ${UNSCOPED_IS_UNSAFE}`);
  assert.match(prompt, RENDERED_COMMAND_BLOCK, `the teardown prompt never prints the commands it built: ${UNSCOPED_IS_UNSAFE}`);
});

test('the teardown prompt interpolates no removal of its own', () => {
  const literals = matchesIn(teardownPrompt(), LITERAL_REMOVAL_PATTERN);

  assert.deepEqual(literals, [], `the teardown prompt writes its own removal (${literals.join(', ')}): ${UNSCOPED_IS_UNSAFE}`);
});

test('the teardown prompt names a bare prune only to forbid it', () => {
  const mentions = matchesIn(teardownPrompt(), PRUNE_MENTION_PATTERN);
  const instructions = mentions.filter(mention => !FORBIDDEN_BARE_PRUNE.test(mention));

  assert.deepEqual(instructions, [], `the teardown prompt tells the agent to prune (${instructions.join(', ')}): ${UNSCOPED_IS_UNSAFE}`);
});

test('every worktree removal the pipeline can emit names the worktree it removes', () => {
  const removals = removalsIn(executableSource());
  const unscoped = removals.filter(removal => !carriesExplicitPath(removal));

  assert.ok(removals.length > 0, 'no worktree removal found — the pattern needs updating');
  assert.deepEqual(unscoped, [], `worktree removal without a path (${unscoped.join(', ')}): ${UNSCOPED_IS_UNSAFE}`);
});
