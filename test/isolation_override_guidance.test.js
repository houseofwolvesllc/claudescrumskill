const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// The pipeline's isolation gate is nearly unconditional: any repository with a
// resolvable main tree yields a viable provisioning strategy and runs in
// parallel. It is reached only when the caller leaves isolationStrategy unset,
// because a concrete value suppresses the gate outright.
//
// A model reading this file fills in arguments it is shown. Documenting the
// field as "optional" was not enough — a real project ran every sprint serially
// on a repo whose gate resolves cleanly to worktree, and the operator concluded
// parallelism was not implemented yet. The instruction has to prohibit, not
// merely permit omission.
const SKILL = path.join(__dirname, '..', 'skills', 'project-orchestrate', 'SKILL.md');

function isolationLine() {
  const line = readFileSync(SKILL, 'utf8')
    .split('\n')
    .find(candidate => candidate.startsWith('isolationStrategy:'));

  assert.ok(line, 'the workflow invocation block no longer documents isolationStrategy');
  return line;
}

test('the isolation argument tells the caller not to set it, rather than merely allowing omission', () => {
  assert.match(
    isolationLine(),
    /DO NOT SET THIS/,
    'isolationStrategy reads as an available option: a model filling in the block will supply one',
  );
});

test('the argument states that setting it suppresses the gate', () => {
  assert.match(isolationLine(), /SUPPRESSES the gate/);
});

test('the argument names the cost of forcing serial, so the tradeoff is visible where the choice is made', () => {
  assert.match(isolationLine(), /gives up running stories concurrently/);
});
