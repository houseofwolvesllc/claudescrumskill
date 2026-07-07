// inline_manifest — the single record of which workflow script inlines which
// canonical _shared module. Consumed by both the regeneration tool
// (bin/regen_workflow_inlines.mjs) and the drift guard (inline_sync.test.mjs),
// so there is exactly one authoritative list. Each epic that inlines a module
// into a script adds its entry here.

export const INLINE_MANIFEST = [
  { script: 'review_panel.js', modules: ['normalize_args'] },
  { script: 'adversarial_verify.js', modules: ['normalize_args'] },
  { script: 'elaborate_epics.js', modules: ['normalize_args'] },
  {
    script: 'sprint_pipeline.js',
    modules: [
      'normalize_args',
      'detect_repo_layout',
      'topological_order',
      'reset_worktree',
      'run_sequential',
    ],
  },
]
