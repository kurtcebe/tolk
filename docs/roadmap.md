# Roadmap

Dependency order. Each milestone ends with a hand-check in the browser, so don't start the next until it passes.

## M0: Capability test and design

Run a throwaway capability test in real Chrome for Dutch, covering the Prompt API, structured output, Summarizer and local speech recognition. Then settle the reader's design and write `docs/ui-ux-spec.md`.

**Verify:** results are recorded in `chrome-ai-notes.md`, v1 scope is adjusted if needed, and the UI spec is agreed.

## M1: Document model and reader

The TypeScript setup (`tsc` in strict mode, with dev-only type packages such as `@types/chrome` and `@types/dom-chromium-ai`), extension skeleton, `Document` model and reader page with typography controls, using a bundled sample document as the source. A fresh project, with no upstream code.

**Verify:** `npx tsc` compiles with no errors, and the extension loads from `extension/`. The sample reads well at different widths, with every setting working and no reflow from controls.

## M2: Read-along

Tokenizer, sentence segmentation, word index, highlighting, click-to-seek, keep-in-view scrolling that yields to manual scrolling, and voice handling. This is the hardest milestone and everything sits on it.

**Verify:** a 2000-word Dutch text stays aligned from start to end at 0.5×, 1× and 2×, through pausing and seeking, with at least two voices including one that behaves badly.

## M3: Availability and languages

The capability layer, its four states per language, the first-run L1 prompt, and L2 detection with override.

**Verify:** each state renders, forced with `chrome://on-device-internals` and stubs. The reader stays fully usable when nothing is available.

## M4: AI tools

Translate with interlinear lines, Simplify through the single mutation path, and Explain.

**Verify:** interlinear pairing holds in a narrow window, simplifying during playback keeps the highlight aligned, revert is instant, a forced bad output fails visibly, and a late result never lands in the wrong popup.

## M5: Word cards

Structured word data, saving with context sentence and source, a saved-word list, and export for Anki.

**Verify:** dictionary form and gender on a set of Dutch words checked by hand, with wrong answers visible and correctable. An export imports cleanly into Anki.

## M6: Live pages

Content script extraction with a freshly vendored Readability, and the handoff into a `Document`.

**Verify:** three real articles, including one with a wrong `<html lang>`.

## M7: EPUB and library

Import, sanitising, chapter rendering, navigation, reading position, and the library view.

**Verify:** several real EPUBs including an older line-wrapped book, a large book, and one with remote references, with no network requests in DevTools. A DRM-protected file gets a clear message.

## After v1

Read it back to me, then recaps, chapter checks, and picture descriptions. See `product-spec.md`.
