// inline_manifest — the single record of which workflow script inlines which
// canonical _shared module. Consumed by both the regeneration tool
// (bin/regen_workflow_inlines.mjs) and the drift guard (inline_sync.test.mjs),
// so there is exactly one authoritative list. Each epic that inlines a module
// into a script adds its entry here.

export const INLINE_MANIFEST = [
  { script: 'adversarial_verify.js', modules: ['normalize_args', 'resolve_agent_tier'] },
  { script: 'elaborate_epics.js', modules: ['normalize_args', 'resolve_agent_tier'] },
  {
    script: 'sprint_pipeline.js',
    modules: [
      'normalize_args',
      'detect_repo_layout',
      'topological_order',
      'reset_worktree',
      'prune_story_worktrees',
      'run_sequential',
      'resolve_agent_tier',
      'resolve_dependency_strategy',
      'resolve_worktree_concurrency',
      'limit_concurrency',
      'classify_story_failure',
      'assert_tree_identity',
      'reconcile_story_results',
    ],
  },
]
