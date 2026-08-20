import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseWorktreeList,
  selectRemovableWorktrees,
  pruneWorktreeCommands,
} from './prune_story_worktrees.mjs'

const REPO = '/repo'
const HARNESS = `${REPO}/.claude/worktrees`

// A realistic listing: the main tree, this sprint's two story worktrees, its two
// detached verify worktrees, a concurrent sprint's worktree at an unmerged
// commit, and an unrelated agent workspace outside the repo entirely.
const PORCELAIN = `worktree ${REPO}
HEAD aaaa111
branch refs/heads/release/worktree-proof

worktree ${HARNESS}/wf_run-2
HEAD bbbb222
branch refs/heads/story/worktree-proof/adr-index

worktree ${HARNESS}/wf_run-3
HEAD cccc333
branch refs/heads/story/worktree-proof/guard-frontmatter

worktree ${HARNESS}/wf_run-6
HEAD bbbb222
detached

worktree ${HARNESS}/wf_run-7
HEAD cccc333
detached

worktree ${HARNESS}/wf_other-2
HEAD dddd444
detached

worktree /Users/dev/assistant/workspaces/abc123
HEAD eeee555
branch refs/heads/chat/abc123
`

const OURS = ['story/worktree-proof/adr-index', 'story/worktree-proof/guard-frontmatter']
const MERGED = new Set(['bbbb222', 'cccc333'])
const isMergedIntoRelease = sha => MERGED.has(sha)

function select(overrides = {}) {
  return selectRemovableWorktrees(parseWorktreeList(PORCELAIN), {
    storyBranches: OURS,
    isMergedIntoRelease,
    ...overrides,
  })
}

test('parses each porcelain block into a path, head, branch, and detached flag', () => {
  const entries = parseWorktreeList(PORCELAIN)
  assert.equal(entries.length, 7)
  assert.deepEqual(entries[0], {
    path: REPO,
    head: 'aaaa111',
    branch: 'release/worktree-proof',
    detached: false,
  })
  assert.deepEqual(entries[3], {
    path: `${HARNESS}/wf_run-6`,
    head: 'bbbb222',
    branch: '',
    detached: true,
  })
})

test('reclaims this sprint’s story worktrees and its merged detached verify worktrees', () => {
  assert.deepEqual(select(), [
    `${HARNESS}/wf_run-2`,
    `${HARNESS}/wf_run-3`,
    `${HARNESS}/wf_run-6`,
    `${HARNESS}/wf_run-7`,
  ])
})

test('never reclaims the main working tree, even when it is the release branch', () => {
  assert.ok(!select().includes(REPO))
})

test('never reclaims a worktree outside .claude/worktrees/, whatever its branch', () => {
  const selected = select()
  assert.ok(!selected.some(path => path.includes('assistant/workspaces')))
})

test('leaves a concurrent sprint’s detached worktree alone because its commit has not merged here', () => {
  assert.ok(!select().includes(`${HARNESS}/wf_other-2`))
})

test('leaves a story worktree alone when the caller did not list its branch, so a failed story stays inspectable', () => {
  const selected = select({ storyBranches: ['story/worktree-proof/adr-index'] })
  assert.deepEqual(selected, [
    `${HARNESS}/wf_run-2`,
    `${HARNESS}/wf_run-6`,
    `${HARNESS}/wf_run-7`,
  ])
})

test('reclaims nothing when no story landed', () => {
  assert.deepEqual(select({ storyBranches: [], isMergedIntoRelease: () => false }), [])
})

test('tolerates empty and whitespace-only listings', () => {
  assert.deepEqual(parseWorktreeList(''), [])
  assert.deepEqual(parseWorktreeList('   \n\n  '), [])
  assert.deepEqual(parseWorktreeList(undefined), [])
})

test('builds a remove --force per path and always prunes last', () => {
  assert.deepEqual(pruneWorktreeCommands(['/a', '/b']), [
    ['worktree', 'remove', '--force', '/a'],
    ['worktree', 'remove', '--force', '/b'],
    ['worktree', 'prune'],
  ])
})

test('prunes stale entries even when there is nothing to remove', () => {
  assert.deepEqual(pruneWorktreeCommands([]), [['worktree', 'prune']])
})
