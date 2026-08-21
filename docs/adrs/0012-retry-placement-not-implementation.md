# ADR-0012: Retry Placement, Not Implementation

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** Keith Garcia (project owner)

## Context

ADR-0009 gave the verify stage a precondition: settle that the tree underneath it is the
story's before saying anything about what it read. ADR-0011 named the mechanism that
trips that precondition. The harness parks every new worktree at the repository's default
branch and each stage repositions itself onto the revision it was given, so a stage that
fails to reposition does not land somewhere arbitrary — it lands on **the default
branch**, silently. That is how a verify stage came to read `main` while believing it was
reading its story's code.

The precondition caught it, and then the story ended. A misplacement was reported as the
story's outcome, so the harness diagnosed its own infrastructure failure correctly and
still spent a story on it. Catching the error bought an accurate sentence in the record
and nothing else; the work that had already been committed was never verified, and the
story came back failed for a reason that was never about its code.

The obvious response — retry — is also the response that is usually wrong in a pipeline
that commits, merges and opens PRs. So the question is not whether retrying helps. It is
which stages can be retried without the retry costing more than the failure did.

## Decision

### 1. Verification is retried, because two properties make retrying it sound

Verification is given a second tree before its misplacement is called a failure. That is
safe here because of two properties, and neither holds generally:

1. **It only reads.** Verification runs the suite and describes what it found. Re-running
   it commits nothing, opens nothing and merges nothing, so a second attempt cannot
   double anything up — the worst a wasted attempt costs is the attempt.
2. **Each attempt gets a fresh worktree.** In worktree mode the retry is handed a new
   tree, so it is a genuinely different placement rather than the same one repeated. An
   attempt that failed to reposition itself tells us nothing about whether the next one
   will, which is exactly the condition under which a retry is informative.

Both are required. The first makes a wasted attempt harmless; the second makes a
successful one possible.

### 2. Implement is deliberately not retried, because it commits

Neither property holds at implement. It writes and it commits, so a second attempt is not
free and not independent: it could leave one story carrying **two sets of commits**, one
from each attempt, with the review, verify and PR stages downstream of a history nobody
intended. A dependency-setup failure is therefore reported as a failure and not retried.

That is a boundary, not an omission, and it is held by a structural guard rather than by
this paragraph. The rule generalises: a stage is retryable when it only reads and when
its next attempt differs from its last. A stage that fails either test is reported.

### 3. Two attempts, and the record says the misplacement survived them

The limit is two rather than more because the failure is bimodal — a stage either
repositions itself or it does not, and a third attempt buys little against a systematic
cause while costing a full stage every time.

Each abandoned attempt is announced naming what `git rev-parse HEAD` actually printed, so
a placement that is wrong the same way twice reads as systematic rather than as one flaky
run. When the attempts are spent, the failure reason carries that the observed head was
unchanged across them. A reader of the record can tell a retried misplacement from an
unlucky one without re-running anything.

## Consequences

**Positive.** A caught placement error no longer costs the story it was caught in.
Verification's diagnosis stays as sharp as ADR-0009 made it, while the common case — one
worktree that failed to reposition — now resolves itself. The failure record
distinguishes a systematic misplacement from a single bad draw.

**Negative.** A verify stage that is failing for a systematic reason now fails twice as
slowly and at twice the cost, because every exhausted retry is a full stage spent to
learn what the first attempt already suggested.

**Risk accepted.** Retryability is a property of each stage, asserted where the stage is
called rather than enforced by the type system. A future reading stage that quietly began
to write would inherit a retry it no longer deserves. The two properties are stated in
the module that owns the limit, so the next author has to disagree with them in writing.

## References

- ADR-0009 (verify claims, do not attest them) — the precondition this makes recoverable
- ADR-0011 (the pipeline states the facts it owns) — where the default-branch landing was named
- `lib/workflows/_shared/retry_placement.mjs`
