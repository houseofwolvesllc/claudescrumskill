# Contributing to claude-scrum-skill

Thanks for your interest in contributing! Here's how to get involved.

## How to Contribute

### Reporting Bugs

Open an issue using the bug report template. Include:
- Which skill triggered the bug
- The `gh auth status` output (redact tokens)
- Steps to reproduce
- Expected vs actual behavior

### Suggesting Features

Open an issue using the feature request template. Describe:
- The problem you're trying to solve
- Your proposed solution
- Which skill(s) it affects

### Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-change`
3. Make your changes
4. Test with a real GitHub Project (even a throwaway one)
5. Submit a PR with a clear description of what changed and why

### Conventions Changes

If your change affects `CONVENTIONS.md`, note that all five skills depend on it. Test that the change doesn't break any skill's assumptions.

## Development Setup

1. Clone the repo
2. Install the GitHub CLI: `brew install gh` (or equivalent)
3. Authenticate: `gh auth login`
4. Copy `skills/` to `~/.claude/skills/` for testing
5. Open Claude Code and test your changes

## Code of Conduct

Be kind. Be constructive. We're all here to build useful tools.

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.
