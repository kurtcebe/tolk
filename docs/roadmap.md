# Roadmap

Dependency order. Each milestone ends with a hand-check in the browser, so don't start the next until it passes. A milestone that adds something a reader can see also adds it to the help page.

## M0: Capability test and design

Run a throwaway capability test in real Chrome for Dutch, covering the Prompt API, structured output, Summarizer, local speech recognition, Translator, Language Detector and voices. Then settle the reader's design and write `docs/ui-ux-spec.md`.

**Verify:** results are recorded in `chrome-ai-notes.md`, v1 scope is adjusted if needed, and the UI spec is agreed.

## M1: Document model and reader

The TypeScript setup (`tsc` in strict mode, with dev-only type packages such as `@types/chrome` and `@types/dom-chromium-ai`), extension skeleton, `Document` model and reader page with typography controls, colour schemes and Book and Learner modes, using a bundled sample document as the source. A fresh project, with no upstream code.

**Verify:** `npx tsc` compiles with no errors, and the extension loads from `extension/`. The sample reads well at different widths and in every colour scheme, with every setting working, no reflow from controls, and no text movement when switching modes.

## M2: Read-along

Tokenizer, sentence segmentation, word index, highlighting, click-to-seek, keep-in-view scrolling that yields to manual scrolling, voice handling with local and remote voices, and the speed slider. This is the hardest milestone and everything sits on it. Read this paragraph and Hear wait for M4, where the margin tools and popup arrive, and playing on into the next chapter waits for M7, the first source with more than one.

**Verify:** a 2000-word Dutch text stays aligned from start to end at the slowest and fastest speeds on the slider and at normal speed, through pausing, seeking and changing speed during playback. Test at least two local voices and one remote voice, including one that reports no word positions and falls back to the sentence highlight. Switching between Book and Learner with the player in place still moves no text. M1 can't fully test this, because the tools the modes show and hide don't exist yet.

## M3: Availability and languages

The capability layer, its four states per language, the first-run L1 prompt, and L2 detection with override.

**Verify:** each state renders, forced with `chrome://on-device-internals` and stubs. The reader stays fully usable when nothing is available.

## M4: Translate and saved words

Translate with interlinear lines, saving a word or phrase with its translation, context sentence and source to a list, and exporting that list as a TSV for Anki. Also the margin tools' Read this paragraph and the popup's Hear, both moved from M2.

**Verify:** interlinear pairing holds in a narrow window, a forced bad output fails visibly, a late result never lands in the wrong popup, saved words survive a browser restart, and an export imports cleanly into Anki.

M5 moved to after v1. The later milestones keep their numbers so existing references stay valid.

## M6: Live pages

Content script extraction with a freshly vendored Readability, and the handoff into a `Document`.

**Verify:** three real articles, including one with a wrong `<html lang>`.

## M7: EPUB and library

Import, sanitising, chapter rendering, navigation, reading position, and the library view. Also playback continuing into the next chapter, moved from M2. Also make the library where the icon lands when a page has no readable article, with the note saying why, replacing M6's stand-in note in the reader tab.

**Verify:** several real EPUBs including an older line-wrapped book, a large book, and one with remote references, with no network requests in DevTools. A DRM-protected file gets a clear message. The icon on a page with no article, and on one Chrome won't let extensions read, opens the library with the right note.

## After v1

**Reading history** isn't an AI feature, so it doesn't wait for the others. **Verify:** time stops a minute after the last scroll with no speech, and while the tab is hidden. Speech keeps it counting with no scrolling. A day's totals match a timed session to within a minute. The calendar reads correctly by keyboard and screen reader, and clearing leaves books and saved words untouched.

Simplify, Explain, word cards, Read it back to me, recaps, chapter checks, and picture descriptions, in that order. See `product-spec.md`.

**Simplify** goes through the single mutation path. **Verify:** simplifying during playback keeps the highlight aligned, revert is instant, and numbers in the source survive the rewrite.

**Explain. Verify:** a forced bad output fails visibly, and a late result never lands in the wrong popup.

**M5: Word cards** adds structured word data to saved words and to the Anki export. **Verify:** dictionary form and gender on a set of Dutch words checked by hand, with wrong answers visible and correctable. An export with the new fields imports cleanly into Anki.
