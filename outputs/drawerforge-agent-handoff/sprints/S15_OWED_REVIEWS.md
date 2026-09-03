# S15. Owed Primary Reviews

## Goal

Run the primary review that sprints S09 and S13 did not get, and apply every finding. The routing policy gives each sprint an independent review by the primary reviewer before its pull request opens. On both days the primary was unavailable, the fallback reviewer ran at the same effort, and the notes recorded the primary review as owed. This sprint pays that debt.

## Model and effort

Opus 5, high, for the two reviews, each in its own read-only agent. Sonnet 5, medium, for routine fixes. Fable 5.1 for any finding that touches the product contract. Review of the fix diff itself by Opus 5, high, before the pull request opens.

## Depends on

S09 for the bracket family. S13 for the geometry loader, the coupon in the worker, printed walls, and the diameter correction. S14, because it changed code both sprints wrote; every finding is verified against the current tree, not the old diff.

## Scope

1. **The S09 review.** Reads the S09 diff for intent and the current tree for fact. Covers rule 9 on every bracket product, print safety at range extremes, the load rules and their messages, and the tests.
2. **The S13 review.** Reads the S13 diff and the current tree. Covers the import rule and the chunk budgets, the coupon request path and its cancellation, printed walls on the products with and without them, the diameter correction arithmetic, and the test dedupe.
3. **Apply every finding.** A blocking or should-fix finding is applied. A nit is applied when it is local. A finding the agent disputes is recorded with the reason and stays open; it is not dropped in silence.
4. **Record.** `30_OWED_REVIEWS_NOTES.md` lists both reviews' findings and what was done with each. The open issues in documents 24 and 28 that record the owed reviews are closed.

## Out of scope

New products. New parameters. Bore and socket compensation, which waits on the socket tray print. Anything the reviews do not raise.

## Deliverables

- Fixes with tests, one squash commit, one pull request
- `30_OWED_REVIEWS_NOTES.md`
- Updated open issues in 24 and 28, the sprint plan, the README, the manifest, and the checksums

## Acceptance

- Both review reports exist in the notes with every finding and its disposition.
- Every applied finding has a test where a test can hold it.
- Every golden triangle count and volume is unchanged unless a finding requires a geometry change, and then the notes say which record moved and why.
- Lint, typecheck, test, build, server render, deploy config, and the browser suite are green.

## Tests

The existing suites. New cases for each applied finding.
