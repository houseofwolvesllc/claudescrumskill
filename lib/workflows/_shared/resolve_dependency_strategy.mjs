// resolve_dependency_strategy — how a fresh worktree obtains its dependency
// directory. Canonical source of truth; inlined into sprint_pipeline.js (the
// runtime cannot import), kept in sync by inline_sync.test.mjs. Pure and
// unit-tested by resolve_dependency_strategy.test.mjs.
//
// The four strategies vary along a known, closed axis, so they are a dispatch
// table over four small functions rather than a hierarchy. Each returns the
// instruction a fresh worktree is provisioned by — the runtime has no
// child_process (ADR-0006), so the commands are delegated to the agent working
// in that worktree, exactly as the between-story reset is — and the outcome
// line the batch is logged by.
//
//   assume-present  nothing; the worktree already carries its dependencies.
//                   The default, and today's behaviour exactly.
//   clone           copy-on-write clone from the main tree. On darwin/APFS
//                   `cp -c` is clonefile: metadata-only, measured at 5ms
//                   against 59ms for a real copy of a 200MB tree, and the gap
//                   widens on node_modules because a real copy pays per file.
//   install         the project's clean-install command — the only strategy
//                   that proves the tree matches the lockfile.
//   symlink         a link to the main tree's directory: free, but shared
//                   mutable state across concurrent stories.
//
// Two of the four refuse rather than degrade quietly. clone on a filesystem
// without copy-on-write support substitutes install and logs the substitution,
// because a real recursive copy of node_modules is the very cost clone exists
// to avoid. symlink throws on a batch carrying a dependency-touching story,
// because one story installing through the shared directory corrupts the
// stories running beside it, and a caller who asked for symlink and quietly got
// something else has wrong information about their run.

export const ASSUME_PRESENT = 'assume-present'
export const CLONE = 'clone'
export const INSTALL = 'install'
export const SYMLINK = 'symlink'

export const DEPENDENCY_STRATEGIES = [ASSUME_PRESENT, CLONE, INSTALL, SYMLINK]

const DEPENDENCY_DIRECTORY = 'node_modules'

// The files a dependency change lands in. A story naming one of them in its
// declared surface is the story symlink refuses to share a directory with; the
// word "lockfile" counts, because a story that says it updates the lockfile has
// declared the same surface as one that names the file.
const DEPENDENCY_FILE_MENTION =
  /package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|lock-?file/i

const PROVISIONERS = {
  [ASSUME_PRESENT]: assumePresent,
  [CLONE]: cloneFromMainTree,
  [INSTALL]: cleanInstall,
  [SYMLINK]: linkToMainTree,
}

// Resolves to { strategy, instruction, outcome }: the strategy in force, the
// provisioning instruction for a fresh worktree (empty when the strategy
// provisions nothing), and the line the batch logs it by. The strategy in force
// is the one requested unless a provisioner substituted another for it, in
// which case it reports the substitute and the outcome says so. Throws when the
// strategy is unknown, its precondition does not hold, or the batch makes it
// unsafe.
export function resolveDependencyStrategy(requestedStrategy = ASSUME_PRESENT, context = {}) {
  const provision = PROVISIONERS[requestedStrategy]
  if (!provision) {
    throw new Error(
      `resolveDependencyStrategy: unknown dependency strategy '${requestedStrategy}'. ` +
        `Known strategies: ${DEPENDENCY_STRATEGIES.join(', ')}.`,
    )
  }
  return { strategy: requestedStrategy, ...provision(context) }
}

function assumePresent() {
  return {
    instruction: '',
    outcome:
      `Dependency strategy: assume-present — no provisioning; ` +
      `every worktree is expected to already carry ${DEPENDENCY_DIRECTORY}.`,
  }
}

function cloneFromMainTree({ mainTreePath, copyOnWriteSupported }) {
  if (copyOnWriteSupported === false) return substituteInstallForClone()

  const source = mainTreeDependencyDirectory(mainTreePath, CLONE)
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, copy-on-write clone it from the main working tree: run ` +
      `\`cp -c -R "${source}" ${DEPENDENCY_DIRECTORY}\` at the root of this worktree. \`-c\` is the ` +
      `APFS clonefile flag — the clone is metadata-only, so it costs milliseconds, and it diverges ` +
      `from the main tree the moment either side writes. If the filesystem cannot clone and the ` +
      `command fails, run the project's clean-install command instead and say so in your notes — a ` +
      `plain recursive copy of ${DEPENDENCY_DIRECTORY} is the cost this strategy exists to avoid.`,
    outcome: `Dependency strategy: clone — every worktree copy-on-write clones ${source}.`,
  }
}

// A filesystem the batch has established has no copy-on-write support cannot
// clone at all, so the substitution is settled here rather than left to fail in
// each worktree. install is the substitute because it is the only other
// strategy that leaves a worktree its own isolated directory. A filesystem
// nobody probed is not one known to lack cloning, so it still clones — the
// instruction above carries the refusal for the case discovered at runtime.
function substituteInstallForClone() {
  return {
    strategy: INSTALL,
    instruction: cleanInstall().instruction,
    outcome:
      `Dependency strategy: install — substituted for clone, which this filesystem has no ` +
      `copy-on-write support for; a real recursive copy of ${DEPENDENCY_DIRECTORY} is the cost ` +
      `clone exists to avoid, so it is not offered as the fallback.`,
  }
}

function cleanInstall() {
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, run the project's clean-install command — the one that installs from the lockfile ` +
      `exactly, without updating it — at the root of this worktree. If it fails because the lockfile ` +
      `does not match the manifest, that failure belongs to the story and is to be fixed, not worked ` +
      `around.`,
    outcome: `Dependency strategy: install — every worktree runs the project's clean-install command.`,
  }
}

function linkToMainTree({ mainTreePath, stories = [] }) {
  refuseDependencyTouchingBatch(stories)
  const target = mainTreeDependencyDirectory(mainTreePath, SYMLINK)
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, link it to the main working tree's: run ` +
      `\`ln -s "${target}" ${DEPENDENCY_DIRECTORY}\` at the root of this ` +
      `worktree. The link is shared mutable state that concurrent stories read through — do not install, ` +
      `add, or remove packages through it.`,
    outcome: `Dependency strategy: symlink — every worktree's ${DEPENDENCY_DIRECTORY} links to ${target}.`,
  }
}

// Every worktree reads and writes one directory under symlink, so a story that
// installs, adds, or removes a package corrupts the stories running beside it.
// The batch is refused, and named — it is the caller's to resolve by choosing
// clone or install, because a symlink run that quietly became something else
// would report an isolation it never had.
function refuseDependencyTouchingBatch(stories) {
  const offender = stories.find(touchesDependencyFiles)
  if (offender) {
    throw new Error(
      `resolveDependencyStrategy: '${SYMLINK}' shares one ${DEPENDENCY_DIRECTORY} across every ` +
        `worktree, and story '${offender.slug}' is identified as touching package.json or a ` +
        `lockfile. Ask for '${CLONE}' or '${INSTALL}' instead.`,
    )
  }
}

// A story's declared surface — the acceptance criteria and technical context it
// was scheduled on — is what identifies it before it runs.
function touchesDependencyFiles(story) {
  const declaredSurface = [...(story.acceptance_criteria || []), story.technical_context || ''].join('\n')
  return DEPENDENCY_FILE_MENTION.test(declaredSurface)
}

// The main tree's dependency directory, which clone and symlink both name and
// install never does. Their shared precondition is therefore knowing where the
// main tree is: a probe that could not answer leaves the path absent, and a
// strategy built on a path nobody resolved would clone from, or link to, the
// wrong place.
function mainTreeDependencyDirectory(mainTreePath, strategy) {
  if (!mainTreePath) {
    throw new Error(
      `resolveDependencyStrategy: '${strategy}' provisions ${DEPENDENCY_DIRECTORY} from the ` +
        `main working tree, whose path was not resolved.`,
    )
  }
  return `${mainTreePath}/${DEPENDENCY_DIRECTORY}`
}
