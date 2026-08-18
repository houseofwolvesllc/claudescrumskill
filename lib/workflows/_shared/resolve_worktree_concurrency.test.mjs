import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveWorktreeConcurrency, CORES, DISK } from './resolve_worktree_concurrency.mjs'

const GIB = 1024 ** 3

// A volume nothing could bind a run on: the disk bound is far above any core
// bound, so a case that wants the core bound simply supplies this.
const AMPLE_DISK = { availableBytes: 4000 * GIB, bytesPerWorktree: 1 * GIB }

test('bounds the fan-out by the host cores, less the two reserved, when disk is ample', () => {
  const bound = resolveWorktreeConcurrency({ cpuCores: 10, ...AMPLE_DISK })

  assert.equal(bound.limit, 8)
  assert.equal(bound.boundBy, CORES)
})

test('never exceeds the runtime ceiling of 16 however many cores the host has', () => {
  const bound = resolveWorktreeConcurrency({ cpuCores: 128, ...AMPLE_DISK })

  assert.equal(bound.limit, 16)
  assert.equal(bound.boundBy, CORES)
})

test('runs one chain at a time on a host with fewer cores than it reserves', () => {
  const bound = resolveWorktreeConcurrency({ cpuCores: 2, ...AMPLE_DISK })

  assert.equal(bound.limit, 1)
  assert.equal(bound.boundBy, CORES)
})

test('bounds the fan-out by disk when the volume fits fewer worktrees than the cores allow', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 32,
    availableBytes: 10 * GIB,
    bytesPerWorktree: 2 * GIB,
  })

  assert.equal(bound.limit, 4)
  assert.equal(bound.boundBy, DISK)
})

test('leaves a fifth of the free space unspent so a full fan-out cannot fill the volume', () => {
  const availableBytes = 10 * GIB
  const bytesPerWorktree = 1 * GIB

  const bound = resolveWorktreeConcurrency({ cpuCores: 32, availableBytes, bytesPerWorktree })

  assert.equal(bound.limit, 8)
  assert.ok(bound.limit * bytesPerWorktree < availableBytes)
})

test('reports cores as the binding constraint when both bounds allow the same fan-out', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 6,
    availableBytes: 5 * GIB,
    bytesPerWorktree: 1 * GIB,
  })

  assert.equal(bound.limit, 4)
  assert.equal(bound.boundBy, CORES)
})

test('takes the disk bound when the ceiling and the cores would both allow more', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 128,
    availableBytes: 20 * GIB,
    bytesPerWorktree: 4 * GIB,
  })

  assert.equal(bound.limit, 4)
  assert.equal(bound.boundBy, DISK)
})

test('takes the core bound when the disk would allow more than the ceiling', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 64,
    availableBytes: 1000 * GIB,
    bytesPerWorktree: 1 * GIB,
  })

  assert.equal(bound.limit, 16)
  assert.equal(bound.boundBy, CORES)
})

test('runs one chain at a time, loudly, when a single worktree exceeds the disk budget', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 32,
    availableBytes: 2 * GIB,
    bytesPerWorktree: 5 * GIB,
  })

  assert.equal(bound.limit, 1)
  assert.equal(bound.boundBy, DISK)
  assert.match(bound.outcome, /^WARNING:/)
})

test('falls back to the core bound and warns when free disk was not measured', () => {
  const bound = resolveWorktreeConcurrency({ cpuCores: 10, availableBytes: 0, bytesPerWorktree: 1 * GIB })

  assert.equal(bound.limit, 8)
  assert.equal(bound.boundBy, CORES)
  assert.match(bound.outcome, /^WARNING:/)
  assert.match(bound.outcome, /not measured/)
})

test('falls back to the core bound and warns when the per-worktree footprint was not measured', () => {
  const bound = resolveWorktreeConcurrency({ cpuCores: 10, availableBytes: 500 * GIB, bytesPerWorktree: 0 })

  assert.equal(bound.limit, 8)
  assert.equal(bound.boundBy, CORES)
  assert.match(bound.outcome, /^WARNING:/)
})

test('falls back to the runtime ceiling when the host core count was not measured', () => {
  const bound = resolveWorktreeConcurrency(AMPLE_DISK)

  assert.equal(bound.limit, 16)
  assert.equal(bound.boundBy, CORES)
})

test('names the binding constraint and both bounds in the outcome line', () => {
  const bound = resolveWorktreeConcurrency({
    cpuCores: 32,
    availableBytes: 10 * GIB,
    bytesPerWorktree: 2 * GIB,
  })

  assert.match(bound.outcome, /Worktree fan-out: 4/)
  assert.match(bound.outcome, /bound by disk/)
  assert.match(bound.outcome, /GiB/)
  assert.match(bound.outcome, /cores would have allowed 16/i)
})

test('warns rather than throwing when the probe measured nothing at all', () => {
  const bound = resolveWorktreeConcurrency()

  assert.equal(bound.limit, 16)
  assert.equal(bound.boundBy, CORES)
  assert.match(bound.outcome, /^WARNING:/)
})
