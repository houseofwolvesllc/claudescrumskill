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

test('resetWorktreeCommands is the exact ordered sequence: reset --hard, checkout -f, clean -fd (NO -x) with node_modules excludes', () => {
  assert.deepEqual(resetWorktreeCommands('release/x'), [
    ['reset', '--hard'],
    ['checkout', '-f', 'release/x'],
    ['clean', '-fd', '-e', 'node_modules', '-e', '**/node_modules'],
  ])
})

test('resetWorktree returns a clean tree, restores tracked files, and PRESERVES every gitignored path (node_modules, .claude, .claude-scrum-skill, .env) while clearing untracked non-ignored cruft', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reset-worktree-'))
  try {
    execGit(['-C', dir, 'init', '-q'])
    execGit(['-C', dir, 'config', 'user.email', 'test@example.com'])
    execGit(['-C', dir, 'config', 'user.name', 'Test'])

    // Release branch: file.txt = "release version". .gitignore covers the deps
    // cache, build output, the skill's install dir and state, and secrets — the
    // exact set that must survive a between-story reset.
    execGit(['-C', dir, 'checkout', '-q', '-b', 'release/x'])
    writeFileSync(
      path.join(dir, '.gitignore'),
      'node_modules/\ndist/\n.claude/\n.claude-scrum-skill/\n.env\n.env.*\n',
    )
    writeFileSync(path.join(dir, 'file.txt'), 'release version\n')
    execGit(['-C', dir, 'add', '.'])
    execGit(['-C', dir, 'commit', '-q', '-m', 'release'])

    // Story branch: file.txt committed as "story version" (differs from release,
    // so a plain checkout of an uncommitted dirty file would genuinely conflict).
    execGit(['-C', dir, 'checkout', '-q', '-b', 'story/1'])
    writeFileSync(path.join(dir, 'file.txt'), 'story version\n')
    execGit(['-C', dir, 'commit', '-q', '-am', 'story'])

    // Simulate an aborted Implement: a conflicting *uncommitted* tracked change,
    // untracked-but-gitignored assets that must ALL survive (deps root + nested,
    // build output, the skill install dir, orchestration state, secrets), and one
    // untracked non-ignored stray that must be cleared.
    writeFileSync(path.join(dir, 'file.txt'), 'dirty uncommitted conflicting change\n')
    mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    mkdirSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep'), { recursive: true })
    writeFileSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js'), 'module.exports = 2\n')
    mkdirSync(path.join(dir, 'dist'), { recursive: true })
    writeFileSync(path.join(dir, 'dist', 'bundle.js'), '/* built */\n')
    mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true })
    writeFileSync(path.join(dir, '.claude', 'skills', 'config.json'), '{}\n')
    mkdirSync(path.join(dir, '.claude-scrum-skill'), { recursive: true })
    writeFileSync(path.join(dir, '.claude-scrum-skill', 'orchestration-state.md'), '# state\n')
    writeFileSync(path.join(dir, '.env.production'), 'SECRET=hunter2\n')
    writeFileSync(path.join(dir, 'stray.tmp'), 'scratch\n')

    resetWorktree(dir, 'release/x', execGit)

    // Clean tree on the release branch, tracked file restored.
    assert.equal(execGit(['-C', dir, 'status', '--porcelain']).trim(), '')
    assert.equal(execGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'release/x')
    assert.equal(readFileSync(path.join(dir, 'file.txt'), 'utf8'), 'release version\n')

    // Every gitignored path survives — this is the guarantee the reset must keep.
    assert.ok(existsSync(path.join(dir, 'node_modules', 'left-pad', 'index.js')))
    assert.ok(existsSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js')))
    assert.ok(existsSync(path.join(dir, 'dist', 'bundle.js')))
    assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'config.json')))
    assert.ok(existsSync(path.join(dir, '.claude-scrum-skill', 'orchestration-state.md')))
    assert.ok(existsSync(path.join(dir, '.env.production')))

    // Untracked, non-ignored cruft is cleared.
    assert.ok(!existsSync(path.join(dir, 'stray.tmp')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resetWorktree preserves node_modules even when it is untracked AND un-ignored — the case the node_modules excludes exist to guard', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reset-worktree-unignored-nm-'))
  try {
    execGit(['-C', dir, 'init', '-q'])
    execGit(['-C', dir, 'config', 'user.email', 'test@example.com'])
    execGit(['-C', dir, 'config', 'user.name', 'Test'])

    // No .gitignore at all: node_modules is untracked and NOT ignored, so a bare
    // `git clean -fd` would delete it. The excludes are what save it.
    execGit(['-C', dir, 'checkout', '-q', '-b', 'release/x'])
    writeFileSync(path.join(dir, 'file.txt'), 'release version\n')
    execGit(['-C', dir, 'add', '.'])
    execGit(['-C', dir, 'commit', '-q', '-m', 'release'])

    mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    mkdirSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep'), { recursive: true })
    writeFileSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js'), 'module.exports = 2\n')
    writeFileSync(path.join(dir, 'stray.tmp'), 'scratch\n')

    resetWorktree(dir, 'release/x', execGit)

    // node_modules is deliberately un-ignored here, so it legitimately remains as
    // an untracked path after the reset — the excludes spared it from -fd, which
    // is the whole point. We assert on the files, not on a clean porcelain.
    assert.equal(execGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'release/x')
    assert.ok(existsSync(path.join(dir, 'node_modules', 'left-pad', 'index.js')))
    assert.ok(existsSync(path.join(dir, 'packages', 'app', 'node_modules', 'dep', 'index.js')))
    assert.ok(!existsSync(path.join(dir, 'stray.tmp')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
