import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resetWorktreeCommands, resetWorktree } from './reset_worktree.mjs'

function execGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

test('resetWorktreeCommands is the exact ordered sequence: reset --hard, checkout -f, clean -fdx with node_modules excludes', () => {
  assert.deepEqual(resetWorktreeCommands('release/x'), [
    ['reset', '--hard'],
    ['checkout', '-f', 'release/x'],
    ['clean', '-fdx', '-e', 'node_modules', '-e', '**/node_modules'],
  ])
})

test('resetWorktree returns a clean tree, preserves node_modules (root + nested), clears dist/, from a genuinely conflicting dirty tree', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reset-worktree-'))
  try {
    execGit(['-C', dir, 'init', '-q'])
    execGit(['-C', dir, 'config', 'user.email', 'test@example.com'])
    execGit(['-C', dir, 'config', 'user.name', 'Test'])

    // Release branch: file.txt = "release version".
    execGit(['-C', dir, 'checkout', '-q', '-b', 'release/x'])
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n')
    writeFileSync(path.join(dir, 'file.txt'), 'release version\n')
    execGit(['-C', dir, 'add', '.'])
    execGit(['-C', dir, 'commit', '-q', '-m', 'release'])

    // Story branch: file.txt committed as "story version" (differs from release,
    // so a plain checkout of an uncommitted dirty file would genuinely conflict).
    execGit(['-C', dir, 'checkout', '-q', '-b', 'story/1'])
    writeFileSync(path.join(dir, 'file.txt'), 'story version\n')
    execGit(['-C', dir, 'commit', '-q', '-am', 'story'])

    // Simulate an aborted Implement: a conflicting *uncommitted* tracked change,
    // untracked node_modules (root + nested) that must survive, and stray build
    // artifacts (dist/, an untracked file) that must be cleared.
    writeFileSync(path.join(dir, 'file.txt'), 'dirty uncommitted conflicting change\n')
    mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    mkdirSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep'), { recursive: true })
    writeFileSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js'), 'module.exports = 2\n')
    mkdirSync(path.join(dir, 'dist'), { recursive: true })
    writeFileSync(path.join(dir, 'dist', 'bundle.js'), '/* built */\n')
    writeFileSync(path.join(dir, 'stray.tmp'), 'scratch\n')

    resetWorktree(dir, 'release/x', execGit)

    // Clean tree on the release branch.
    assert.equal(execGit(['-C', dir, 'status', '--porcelain']).trim(), '')
    assert.equal(execGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'release/x')
    assert.equal(readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'release version\n')

    // node_modules survives, root and nested.
    assert.ok(existsSync(path.join(dir, 'node_modules', 'left-pad', 'index.js')))
    assert.ok(existsSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js')))

    // Build artifacts and stray untracked files are cleared.
    assert.ok(!existsSync(path.join(dir, 'dist')))
    assert.ok(!existsSync(path.join(dir, 'stray.tmp')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
