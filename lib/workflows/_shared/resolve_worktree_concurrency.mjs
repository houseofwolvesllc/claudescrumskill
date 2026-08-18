// resolve_worktree_concurrency — how many story chains may hold a worktree at
// once. Canonical source of truth; inlined into sprint_pipeline.js (the runtime
// cannot import), kept in sync by inline_sync.test.mjs. Pure and unit-tested by
// resolve_worktree_concurrency.test.mjs.
//
// Fan-out used to be bounded by cores alone — min(16, cores - 2), the Workflow
// runtime's own cap. Cores say how many chains a host can work on at once; they
// say nothing about whether sixteen worktrees, each carrying its own
// node_modules, fit on the volume. The two failures are not symmetric: a run
// that is slower than necessary finishes late, and a run that fills the volume
// takes the repository, the sprint, and everything else on that disk with it.
// So the fan-out is the smaller of the two bounds.
//
// Which bound it was is reported, not inferred, because a run that finished at
// three worktrees on a sixteen-core host is either a nearly-full disk or a bug,
// and only the run knows which. A logged "bound by disk" turns an unexplained
// slow run into a diagnosis.
//
// The measurements come from an agent probe (the runtime has no child_process —
// ADR-0006), so any of them can be missing. A missing measurement is never
// invented into a bound: an unmeasured volume falls back to the core bound and
// says, loudly, that nothing is bounding the run by disk.

export const CORES = 'cores'
export const DISK = 'disk'

// The Workflow runtime will not run more agents concurrently than this, so no
// bound above it means anything.
const RUNTIME_CONCURRENCY_CEILING = 16

// The host keeps cores for the work that is not a story chain — the session
// driving them, the operator's editor, the OS.
const CORES_RESERVED_FOR_THE_HOST = 2

// A fifth of the free space is never spent. A worktree costs more than the
// dependency directory it is measured by — a checkout, build output, logs — and
// a volume driven to its last free byte fails everything sharing it, not just
// this run.
const SPENDABLE_FRACTION_OF_FREE_DISK = 0.8

// One chain at a time is the floor. A volume too small for even a single
// worktree still runs its stories, one after another, because zero is not a
// fan-out any batch can proceed under; the outcome says so rather than leaving
// the operator with a batch that never starts.
const SERIAL = 1

const BYTES_PER_GIB = 1024 ** 3

// Resolves to { limit, boundBy, outcome }: how many story chains may run
// concurrently, which of the two constraints held it there, and the line the
// run is logged by. Takes { cpuCores, availableBytes, bytesPerWorktree }, each
// as the probe reported it — zero or absent means unmeasured.
export function resolveWorktreeConcurrency(measurements = {}) {
  const cores = concurrencyFromCores(measurements.cpuCores)
  if (!diskWasMeasured(measurements)) return boundByCoresAlone(measurements, cores)

  const bounds = { cores, disk: concurrencyFromDisk(measurements) }
  if (bounds.disk < bounds.cores) return boundByDisk(measurements, bounds)
  return boundByCores(measurements, bounds)
}

function concurrencyFromCores(cpuCores) {
  if (!isMeasured(cpuCores)) return RUNTIME_CONCURRENCY_CEILING
  const forStories = Math.floor(cpuCores) - CORES_RESERVED_FOR_THE_HOST
  return atLeastSerial(Math.min(RUNTIME_CONCURRENCY_CEILING, forStories))
}

function concurrencyFromDisk({ availableBytes, bytesPerWorktree }) {
  return atLeastSerial(Math.floor(spendableBytes(availableBytes) / bytesPerWorktree))
}

function boundByDisk(measurements, bounds) {
  return {
    limit: bounds.disk,
    boundBy: DISK,
    outcome: oneWorktreeExceedsTheBudget(measurements)
      ? crowdedVolumeOutcome(measurements, bounds)
      : diskBoundOutcome(measurements, bounds),
  }
}

function boundByCores(measurements, bounds) {
  return {
    limit: bounds.cores,
    boundBy: CORES,
    outcome:
      `Worktree fan-out: ${bounds.cores} concurrent worktrees — bound by cores: ` +
      `${describeCoreBound(measurements.cpuCores)}. Disk would have allowed ${bounds.disk} ` +
      `(${describeDiskBudget(measurements)}).`,
  }
}

function diskBoundOutcome(measurements, bounds) {
  return (
    `Worktree fan-out: ${bounds.disk} concurrent worktrees — bound by disk ` +
    `(${describeDiskBudget(measurements)}). Cores would have allowed ${bounds.cores} ` +
    `(${describeCoreBound(measurements.cpuCores)}).`
  )
}

// The volume has no room for the fan-out the batch was going to run, so the
// batch runs serially — and even that is not proven to fit, since one worktree
// alone overruns the budget. Loud, because the operator is one story away from
// a full disk and nothing here can prevent it.
function crowdedVolumeOutcome(measurements, bounds) {
  return (
    `WARNING: Worktree fan-out: ${bounds.disk} concurrent worktree — bound by disk, and a single ` +
    `worktree already exceeds the budget (${describeDiskBudget(measurements)}). Stories run one at ` +
    `a time and the volume may still fill. Free space on this volume before running a larger batch.`
  )
}

// Nothing to divide, so nothing bounds this run by disk. The core bound still
// holds and the batch still runs — an unmeasured volume is not evidence of a
// full one — but the run says which measurement was missing, because that is
// the fact an operator needs when the disk does fill.
function boundByCoresAlone({ availableBytes, bytesPerWorktree, cpuCores }, cores) {
  return {
    limit: cores,
    boundBy: CORES,
    outcome:
      `WARNING: Worktree fan-out: ${cores} concurrent worktrees — bound by cores: ` +
      `${describeCoreBound(cpuCores)}, and by nothing else: free disk is ` +
      `${describeMeasurement(availableBytes)} and the per-worktree footprint is ` +
      `${describeMeasurement(bytesPerWorktree)}, so this run is NOT bounded by disk and a full ` +
      `fan-out could exhaust the volume.`,
  }
}

// The arithmetic behind the core bound, so a run that fanned out to six on an
// eight-core host needs no second source to explain itself.
function describeCoreBound(cpuCores) {
  if (!isMeasured(cpuCores)) {
    return `the runtime ceiling of ${RUNTIME_CONCURRENCY_CEILING}, since the host's core count is not measured`
  }
  return (
    `min(${RUNTIME_CONCURRENCY_CEILING}, ${Math.floor(cpuCores)} cores - ` +
    `${CORES_RESERVED_FOR_THE_HOST} reserved for the host)`
  )
}

function describeDiskBudget({ availableBytes, bytesPerWorktree }) {
  return (
    `${describeMeasurement(spendableBytes(availableBytes))} spendable of ` +
    `${describeMeasurement(availableBytes)} free, at ` +
    `${describeMeasurement(bytesPerWorktree)} per worktree`
  )
}

function describeMeasurement(bytes) {
  return isMeasured(bytes) ? `${(bytes / BYTES_PER_GIB).toFixed(1)} GiB` : 'not measured'
}

function oneWorktreeExceedsTheBudget({ availableBytes, bytesPerWorktree }) {
  return spendableBytes(availableBytes) < bytesPerWorktree
}

function spendableBytes(availableBytes) {
  return availableBytes * SPENDABLE_FRACTION_OF_FREE_DISK
}

function diskWasMeasured({ availableBytes, bytesPerWorktree }) {
  return isMeasured(availableBytes) && isMeasured(bytesPerWorktree)
}

// The probe reports what it could read and zero for what it could not, so a
// measurement is a positive, finite number of bytes or cores and nothing else.
function isMeasured(value) {
  return Number.isFinite(value) && value > 0
}

function atLeastSerial(limit) {
  return Math.max(SERIAL, limit)
}
