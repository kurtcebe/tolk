# Product spec

## Who it's for

Someone at roughly A2–B2 who can read authentic text in their target language, but slowly and with gaps. They don't want a graded-reader app with curated content. They want to read the thing they actually wanted to read.

The failure we're designing against: a reader opens an article or book, hits three unknown words in the first paragraph, and switches to the English version. Every feature exists to keep them in L2 for one more paragraph.

The first target language is Dutch, but nothing is Dutch-specific. Dutch is also a useful test case because it sits outside Chrome's officially supported Prompt API languages. See `chrome-ai-notes.md`.

## Sources

- **Live page:** the current tab's article, extracted into the reader.
- **EPUB:** imported by file picker or drag and drop, then stored in the browser. DRM-protected files can't be read and get a clear message.

PDF is out of scope.

## Library

A simple grid of imported books showing cover, title, author and progress. Readers can import, delete, and resume where they left off. Live pages aren't saved to the library.

Books live only in this browser profile, and uninstalling the extension deletes them. The UI has to say so.

## Reading history

How much a reader read, day by day and per language, shown as a calendar in the library. It counts active reading time and words read, in books and live pages alike. There are no goals, streaks or rewards: it's a record, not a game.

Only daily totals are kept, never what was read. It stays in this browser like books do, and a reader can clear it.

## Reader

Familiar reader conventions, such as font, size, spacing, theme and player controls, with its own visual identity. Don't copy Chrome's icons, artwork or exact styling, and don't use "Chrome" or "Google" in the name or imply endorsement.

Two modes show more or fewer tools over the same text: Book, which is close to a plain page, and Learner, the default. There are four colour schemes: Light, Sepia, Dark and a lower-contrast Dim.

`ui-ux-spec.md` has the detailed design.

## v1 features

**Read-along.** Speech synthesis with word and sentence highlighting. Slow playback is a core learner control. Speed is a slider with fine steps rather than a few fixed presets, so a reader can settle on the fastest speed they're comfortable with. Voices respond differently: on the Mac we tested, the remote voice follows 1% steps, while local voices move in larger jumps and can't go much below about 55% of normal speed. Clicking a word seeks during playback, and selecting a word or phrase plays just that selection.

Readers choose from the local and remote voices Chrome offers for the language. A local voice is the default, and the player says so when a remote one is chosen, because its text goes to Google. A voice that doesn't report word positions highlights the current sentence only, and the voice picker says so.

**Translate.** An L1 translation of a word, phrase or paragraph. The original stays visible. Paragraphs are interlinear, with an L1 line under each L2 sentence.

**Saved words.** A reader can save a selected word or phrase with its translation, context sentence and source, see them in a list, and export them as a TSV that Anki can import. It uses Translate only, with no dictionary form, gender or AI-written definition. If translation isn't available, the word still saves with the translation blank. Keeping the sentence matters because a word translated on its own can get the wrong sense.

If L2 equals L1, the tools that produce L1 output hide. Read-along stays available.

Every feature is checked per language. When one can't run for the current language, the reader says so plainly and the rest keeps working.

## After v1

Simplify, Explain and word cards moved here after the Dutch capability test showed the Prompt API isn't reliable enough for them yet. See `chrome-ai-notes.md`.

In order:

1. **Simplify.** Rewrites text in easier L2 and stays in L2. At paragraph scope it replaces the text in place and can be reverted. At word or phrase scope it's informational and leaves the text untouched. The target difficulty is a free-form instruction with a few starter phrasings, not a CEFR level.
2. **Explain.** For a paragraph, what a confusing construction means and why it's shaped that way, answered in L1.
3. **Word cards.** Selecting a word returns its dictionary form, part of speech, gender where relevant, and a definition based on that sentence, using structured output. Cards extend saved words and add these fields to the Anki export. The reader must be able to see or correct uncertain fields, because a confidently wrong gender is the main risk.
4. **Read it back to me.** The learner reads a sentence aloud using local speech recognition, and we mark each word against the word index. This is the signature feature. It checks whether you can be understood, not your accent. Chrome has no local Dutch speech pack yet, so it can't run for Dutch until one ships.
5. **"Previously…" recaps** when reopening a book, in the book's language.
6. **Chapter checks.** A few comprehension questions at the end of a chapter.
7. **Describe this picture.** A simple L2 description of an EPUB illustration.

## Not planned

- PDF.
- Spaced repetition. Export to Anki, which does it better.
- Mobile. The built-in AI APIs are desktop-only.
- Cloud model fallback. It would make this a different product with a different privacy story.

## What success looks like

A reader finishes an article or chapter they would otherwise have abandoned, and ends with four or five words saved. Using every feature isn't the goal.

## Privacy

Text goes to models running in the browser, never to a server of ours. Books, saved words and reading history stay on the machine. There are no analytics, telemetry or crash reports.

Two things can leave the machine, and the store listing must say so:

- **Settings sync.** Settings in `chrome.storage.sync` follow the Chrome profile, so Chrome sends them to the reader's Google account. This covers settings only, never reading content or saved words. A voice choice stays on its own computer and doesn't sync.
- **Chrome's remote speech voices.** If a reader picks a voice Chrome marks as remote, Chrome sends the text to Google to be spoken. Local voices are the default, and the player says so when a remote one is chosen.

Being exact here matters, because a privacy claim a reader can disprove is worse than a longer true one.
