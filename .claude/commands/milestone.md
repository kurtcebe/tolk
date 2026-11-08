---
description: Start work on a roadmap milestone
argument-hint: [milestone id, e.g. M2]
---

Work on milestone $ARGUMENTS from `docs/roadmap.md`.

1. Read `docs/roadmap.md` and confirm every milestone before $ARGUMENTS is complete. If one isn't, say so and stop.
2. Read the sections of `docs/ui-ux-spec.md` and `docs/architecture.md` that cover $ARGUMENTS, and quote the constraints that apply.
3. Check `docs/chrome-ai-notes.md` for anything touching a built-in AI API, and verify the current API against https://developer.chrome.com/docs/ai/built-in-apis before writing calls. Record any drift.
4. Lay out a short plan: files added, and the one thing most likely to go wrong. Wait for my go-ahead.
5. Build it, and check each `CLAUDE.md` invariant against what you wrote.
6. Give me the verification steps from the roadmap as a checklist I can run in the browser.

Don't move on to the next milestone.
