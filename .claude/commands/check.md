---
description: Audit uncommitted changes against the project invariants
---

Review the uncommitted diff against the invariants in `CLAUDE.md`. For each one, say pass, fail or not applicable, with the specific lines if it fails.

Pay particular attention to the ones that break silently:

- **Word index integrity.** Does anything write to a block's text or DOM without going through the mutate-and-retokenize path in `docs/architecture.md`? Is the utterance string built in the same pass as the span offsets?
- **Availability gating.** Is any AI call reachable without a capability check for that language, including on a retry path or in a queue drain?
- **Network.** Could anything, including EPUB content, trigger a request?

Report only real problems. Don't pad the list.
