import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent`/`parallel`/`phase` as globals and the
// script has no module surface, so what the script does with them — one review
// pass, not a review plus a self-check; a fan-out bound taken in the one order
// that cannot deadlock — is asserted against its source text.
const REVIEW_PROMPT_PATTERN = /function buildReviewPrompt\([\s\S]*?\n}/
const IMPLEMENT_PROMPT_PATTERN = /function buildImplementPrompt\([\s\S]*?\n}/
const VERIFY_PROMPT_PATTERN = /function buildVerifyPrompt\([\s\S]*?\n}/
const VERIFY_REVISION_PATTERN = /function verifyRevision\([\s\S]*?\n}/
const IMPLEMENT_HEAD_COMMIT_PATTERN = /function implementHeadCommit\([\s\S]*?\n}/
const VERIFY_RETURN_SCHEMA_PATTERN = /const VERIFY_RETURN_SCHEMA = \{[\s\S]*?\n}/
const TREE_IDENTITY_FAILED_PATTERN = /function treeIdentityFailed\([\s\S]*?\n}/
const WRONG_TREE_HEAD_PATTERN = /function wrongTreeHead\([\s\S]*?\n}/
const DETACHED_CHECKOUT_PATTERN = /git checkout --detach \$\{revision\}/g
// A checkout that claims a ref instead of detaching at a revision.
const ATTACHED_CHECKOUT_PATTERN = /git checkout (?!--detach)/
// The verify stage is placed in a tree under both execution models, so both
// place it the same way.
const EXECUTION_MODELS = ['worktree', 'serial-in-tree']
const LAYOUT_PROBE_PATTERN = /async function probeRepoLayout\([\s\S]*?\n}/
const RUN_STORY_PATTERN = /async function runStory\([\s\S]*?\n}/
const RUN_STORY_CHAIN_PATTERN = /async function runStoryChain\([\s\S]*?\n}/
const CHAIN_OUTCOME_PATTERN = /function chainOutcome\([\s\S]*?\n}/
const RECONCILED_RESULTS_PATTERN = /function reconciledResults\([\s\S]*?\n}/
// The batch handing back its surviving results without counting them against the
// stories it was asked to run.
const UNRECONCILED_RETURN_PATTERN = /return results\.filter\(Boolean\)/
const SPRINT_STORY_RETURN_SCHEMA_PATTERN = /const SPRINT_STORY_RETURN_SCHEMA = \{[\s\S]*?\n}/
const SELF_CHECK_PATTERN = /\b(confirm|verify|double-check|re-check)\b/i
// The epic a story branch carries between `story/` and the slug: the
// interpolation in code, or the placeholder where a comment documents the shape.
const EPIC_SEGMENT_PATTERN = /(\$\{epicSlug\}|<epicSlug>)\//
const UNNAMESPACED_STORY_BRANCH_PATTERN = new RegExp(`story/(?!${EPIC_SEGMENT_PATTERN.source})`)

function pipelineSource() {
  return readFileSync(fileURLToPath(new URL('./sprint_pipeline.js', import.meta.url)), 'utf8')
}

function sourceOf(pattern) {
  return pipelineSource().match(pattern)[0]
}

function linesNamingAnUnnamespacedStoryBranch() {
  return pipelineSource()
    .split('\n')
    .filter(line => UNNAMESPACED_STORY_BRANCH_PATTERN.test(line))
    .map(line => line.trim())
}

test('the review prompt tells the reviewer where the baseline lives', () => {
  assert.match(sourceOf(REVIEW_PROMPT_PATTERN), /the engineering baseline at \$\{baselinePath\}/)
})

test('the review prompt issues no self-check instruction alongside the review', () => {
  assert.doesNotMatch(sourceOf(REVIEW_PROMPT_PATTERN), SELF_CHECK_PATTERN)
})

test('the layout probe asks for the disk and core facts the fan-out bound is resolved from', () => {
  const probe = sourceOf(LAYOUT_PROBE_PATTERN)

  assert.match(probe, /availableDiskBytes/)
  assert.match(probe, /dependencyDirectoryBytes/)
  assert.match(probe, /cpuCores/)
  assert.match(probe, /Report 0 for any of the three measurements you could not take/)
})

// copyOnWriteSupported gates both whether `clone` is offered at all and whether
// it falls back to `install`. It was destructured and branched on for a whole
// release without ever being asked for, so it read `undefined` in every real
// run: `clone` was always offered and its fallback could never fire. The probe
// must ask, and must be told that false is the safe answer.
test('the layout probe asks whether the filesystem can clone', () => {
  const probe = sourceOf(LAYOUT_PROBE_PATTERN)

  assert.match(probe, /copyOnWriteSupported/)
  assert.match(probe, /reflink=always|cp -c/)
  assert.match(probe, /false is the safe answer/)
})

test('a story takes its worktree slot only after its in-batch blockers have cleared', () => {
  // Reversing these two deadlocks the batch: a dependent holding a slot while it
  // waits for a blocker that has not started starves the blocker of slots.
  const runStory = sourceOf(RUN_STORY_PATTERN)

  assert.ok(runStory.indexOf('unmetInBatchBlockers') < runStory.indexOf('withWorktreeSlot'))
})

test('the return schema offers the infrastructure failure alongside the story’s own', () => {
  assert.match(sourceOf(SPRINT_STORY_RETURN_SCHEMA_PATTERN), /'done', 'blocked', 'failed', 'infrastructure-failed'/)
})

test('the implement prompt tells a worktree that cannot obtain dependencies to report, not implement', () => {
  const prompt = sourceOf(IMPLEMENT_PROMPT_PATTERN)

  assert.match(prompt, /dependencySetupFailure/)
  assert.match(prompt, /not a failure of this story's code/)
})

test('a story whose worktree never obtained its dependencies stops before the review stage', () => {
  // Reviewing a story whose code never ran would spend a review pass on a tree
  // that was never provisioned.
  const chain = sourceOf(RUN_STORY_CHAIN_PATTERN)

  assert.match(chain, /dependencySetupFailed/)
  assert.ok(chain.indexOf('dependencySetupFailed') < chain.indexOf('buildReviewPrompt'))
})

test('the verify stage is placed at the head commit the implement stage reported', () => {
  // A branch ref belongs to one worktree at a time and the implement worktree
  // still holds this story's; a commit belongs to none. Detaching at the commit
  // reads the same content without contending for the ref — the collision cost
  // one run roughly twelve blocked stories whose code was fine.
  const prompt = sourceOf(VERIFY_PROMPT_PATTERN)

  assert.match(prompt, /verifyRevision\(impl, branch\)/)
  assert.equal((prompt.match(DETACHED_CHECKOUT_PATTERN) || []).length, EXECUTION_MODELS.length)
})

test('the verify prompt names no branch to check out', () => {
  assert.doesNotMatch(sourceOf(VERIFY_PROMPT_PATTERN), ATTACHED_CHECKOUT_PATTERN)
})

test('an implement result carrying no commit still leaves verify a revision to detach at', () => {
  // Backward compatibility: no SHA degrades to the branch tip rather than
  // interpolating nothing into the checkout the verify agent is handed.
  assert.match(sourceOf(IMPLEMENT_HEAD_COMMIT_PATTERN), /impl\.commits\?\.at\(-1\)/)
  assert.match(sourceOf(VERIFY_REVISION_PATTERN), /implementHeadCommit\(impl\) \|\| branch/)
})

test('the verify prompt settles which tree it is in before it reports on any file', () => {
  // 'src/ is completely empty' and 'I cannot read the tree I was pointed at' are
  // different diagnoses. The first is only available to a stage that never
  // established the second, so the identity line precedes the reading it gates.
  const prompt = sourceOf(VERIFY_PROMPT_PATTERN)

  assert.match(prompt, /treeIdentityAssertion\(implementHeadCommit\(impl\)\)/)
  assert.ok(prompt.indexOf('${treeIdentityLine}') < prompt.indexOf('build/lint/test'))
})

test('the verify return reports a tree-identity failure apart from what it read', () => {
  const schema = sourceOf(VERIFY_RETURN_SCHEMA_PATTERN)

  assert.match(schema, /treeIdentityFailure/)
  assert.match(schema, /notes/)
})

test('the verify return carries the SHA the stage stood at, matched or not', () => {
  assert.match(sourceOf(VERIFY_RETURN_SCHEMA_PATTERN), /observedHead/)
})

test('the SHA the stage stood at is compared against the one it was placed at', () => {
  // The stage's own failure report is raised only when the stage noticed, and a
  // stage describing the wrong tree is one that did not. The comparison holds
  // either way, so the wrong tree is caught in data rather than in a flag.
  const wrongTree = sourceOf(WRONG_TREE_HEAD_PATTERN)

  assert.match(wrongTree, /assigned: implementHeadCommit\(impl\)/)
  assert.match(wrongTree, /observed: verify\.observedHead/)
  assert.match(wrongTree, /verify\.treeIdentityFailure/)
})

test('the tree-identity failure quotes the SHA the stage stood at', () => {
  assert.match(sourceOf(TREE_IDENTITY_FAILED_PATTERN), /detail: observedHead/)
})

test('a verify stage that read some other tree stops before the story is finalized', () => {
  // Nothing it read belongs to this story, so neither its pass nor its fail is a
  // statement about the code — finalizing on either would act on a tree that was
  // never this story's.
  const chain = sourceOf(RUN_STORY_CHAIN_PATTERN)

  assert.match(chain, /wrongTreeHead\(impl, verify\)/)
  assert.match(chain, /treeIdentityFailed/)
  assert.ok(chain.indexOf('treeIdentityFailed') < chain.indexOf("verify.verifyStatus === 'fail'"))
})

test('a tree that was not the story’s is an infrastructure failure, not a blocked story', () => {
  const outcome = sourceOf(TREE_IDENTITY_FAILED_PATTERN)

  assert.match(outcome, /treeIdentityFailure\(\{/)
  assert.doesNotMatch(outcome, /status: '(blocked|failed)'/)
})

test('no story branch is named without its epic prefix', () => {
  // Two epics in flight can carry stories with the same slug. Under a flat
  // `story/<slug>` both runs drive one ref and the last writer wins, which is
  // how a real run lost a branch — so the epic sits between the two everywhere.
  const offenders = linesNamingAnUnnamespacedStoryBranch()

  assert.deepEqual(offenders, [], `story branches missing their epic prefix:\n${offenders.join('\n')}`)
})

test('an unhandled error in a story chain is still the story’s own failure', () => {
  assert.match(sourceOf(CHAIN_OUTCOME_PATTERN), /codeFailure\(/)
})

test('the batch counts what it returns against the stories it was asked to run', () => {
  const reconciliation = sourceOf(RECONCILED_RESULTS_PATTERN)

  assert.match(reconciliation, /reconcileStoryResults\(\{ requested: stories, returned \}\)/)
})

test('neither execution model hands back its results unreconciled', () => {
  // A dropped story leaves a shorter array and nothing else, so the batch that
  // lost one is told from the batch that finished only by the count — on both
  // paths, since a run takes exactly one of them.
  const pipeline = pipelineSource()

  assert.equal(pipeline.match(/return reconciledResults\(results\)/g).length, 2)
  assert.doesNotMatch(pipeline, UNRECONCILED_RETURN_PATTERN)
})
